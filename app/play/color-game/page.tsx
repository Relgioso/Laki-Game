'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { launchConfetti } from '@/lib/confetti'
import { playApplause, playConfettiPop, playWinChime, scheduleSpinTicks } from '@/lib/sound'
import styles from './color-game.module.css'

type ComboSymbol = 'win' | 'laki' | 'clover'
type PlayResult = ComboSymbol | 'merch'
type MachineState = 'idle' | 'pulling' | 'open' | 'closing'
type DicePhase = 'waiting' | 'dropping' | 'bounce-1' | 'bounce-2' | 'bounce-3' | 'settling' | 'landed'
type ResultPhase = 'none' | 'ready' | 'visible'
type NetworkState = 'idle' | 'requesting' | 'success' | 'error'

type PlayResultPrize = {
  name: string
  prizeType: string
}

type RoundOutcome = {
  result: PlayResult
  prize: PlayResultPrize
}

type MotionTimings = {
  machineOpen: number
  machineHold: number
  machineClose: number
  revealDelay: number
}

type DiceMotion = {
  distancePx: number
  fallMs: number
  staggerMs: number[]
  bounceUpMs: number[]
  bounceDownMs: number[]
  settleMs: number
  totalMs: number
  reduced: boolean
}

type DicePose = {
  x: number
  y: number
  angle: number
  scaleX: number
  scaleY: number
}

const SYMBOLS: ComboSymbol[] = ['win', 'laki', 'clover']
const INITIAL_TILES: ComboSymbol[] = ['laki', 'clover', 'win']

const SYMBOL_ART: Record<ComboSymbol, string> = {
  win: '/color-game/win.svg',
  laki: '/color-game/laki.svg',
  clover: '/color-game/clover.svg',
}

const BOARD_ASSETS = {
  back: '/color-game/colorgame-bg-1.svg',
  frontDefault: '/color-game/colorgame-front-default.svg',
  frontOpen: '/color-game/colorgame-front-open.svg',
  ring: '/color-game/colorgame-ring.svg',
} as const

// Figma prototype targets: 300ms open, 200ms hold, 744ms close.
const DEFAULT_TIMINGS: MotionTimings = {
  machineOpen: 300,
  machineHold: 200,
  machineClose: 744,
  revealDelay: 220,
}

const REDUCED_TIMINGS: MotionTimings = {
  machineOpen: 60,
  machineHold: 80,
  machineClose: 100,
  revealDelay: 100,
}

// The default and open Figma rope assets put the ring about 80px apart at
// the 440px reference width. Dragging reaches that exact open position only
// after a meaningful, progressively resisted 120px+ physical pull.
const FIGMA_OPEN_PULL_PX = 80
const PULL_TRIGGER_PROGRESS = 0.875
const MAX_RAW_PULL_PX = 160

// Keep the approved lower-middle landing line even as the chamber dice shrink.
const LANDING_TOP = 0.682
const FINAL_DICE_SCALE = 0.92
const GRAVITY_POWER = 2.15
const SPIN_POWER = 1.35

const TILE_SETTLE_OFFSETS = [
  { dy: -4, rotate: -6 },
  { dy: 3, rotate: 5 },
  { dy: -1.5, rotate: -3 },
] as const

const DICE_VARIATION = [
  { delay: 0, drift: 11, direction: 1, turns: 1, impactSpin: 320, bounce: 0.96 },
  { delay: 55, drift: 0, direction: -1, turns: 2, impactSpin: 660, bounce: 0.94 },
  { delay: 95, drift: -11, direction: 1, turns: 1, impactSpin: 315, bounce: 1 },
] as const

function randomSymbol(): ComboSymbol {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
}

function nonMatchingArrangement(): [ComboSymbol, ComboSymbol, ComboSymbol] {
  const shuffled = [...SYMBOLS].sort(() => Math.random() - 0.5)
  const arrangement: ComboSymbol[] = [shuffled[0], shuffled[0], shuffled[1]]
  arrangement.sort(() => Math.random() - 0.5)
  return arrangement as [ComboSymbol, ComboSymbol, ComboSymbol]
}

function isPlayResult(value: unknown): value is PlayResult {
  return value === 'win' || value === 'laki' || value === 'clover' || value === 'merch'
}

function isPrize(value: unknown): value is PlayResultPrize {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.name === 'string' && typeof candidate.prizeType === 'string'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong — please try again.'
}

// Three resistance bands: direct at first, then increasingly weighted near
// the trigger. The visual range remains aligned with the Figma Open variant.
function resistedPull(rawDelta: number): number {
  const pull = Math.max(0, Math.min(MAX_RAW_PULL_PX, rawDelta))
  if (pull <= 48) return pull
  if (pull <= 104) return 48 + (pull - 48) * 0.35
  return Math.min(FIGMA_OPEN_PULL_PX, 67.6 + (pull - 104) * 0.22)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function mix(start: number, end: number, progress: number): number {
  return start + (end - start) * progress
}

function guardedDrift(index: number, angle: number, drift: number, dieHeight: number, weight = 1): number {
  if (index === 1) return drift
  const radians = angle * Math.PI / 180
  const rotatedOverhang = dieHeight * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)) - 1) / 2
  const clearance = rotatedOverhang * weight
  return index === 0 ? Math.max(drift, clearance) : Math.min(drift, -clearance)
}

function createDiceMotion(stageHeight: number, startTop: number, dieHeight: number, reduced: boolean): DiceMotion {
  const distancePx = stageHeight * LANDING_TOP - startTop - dieHeight * (1 - FINAL_DICE_SCALE) / 2
  const fallMs = reduced
    ? 160
    : Math.round(Math.min(710, Math.max(520, 630 * Math.sqrt(distancePx / 633))))
  const staggerMs = reduced ? [0, 0, 0] : DICE_VARIATION.map((die) => die.delay)
  const bounceUpMs = reduced ? [0, 0, 0] : [190, 130, 85]
  const bounceDownMs = reduced ? [0, 0, 0] : [160, 115, 80]
  const settleMs = reduced ? 40 : 90
  // Later dice catch up during the fall, so their release is staggered without
  // spreading the group far apart or making all three impacts simultaneous.
  const lastImpactMs = fallMs + Math.max(...staggerMs) * 0.3
  const totalMs = lastImpactMs +
    bounceUpMs.reduce((sum, ms) => sum + ms, 0) +
    bounceDownMs.reduce((sum, ms) => sum + ms, 0) + settleMs

  return { distancePx, fallMs, staggerMs, bounceUpMs, bounceDownMs, settleMs, totalMs, reduced }
}

function dicePhaseAt(elapsed: number, motion: DiceMotion): DicePhase {
  let boundary = motion.fallMs + Math.max(...motion.staggerMs) * 0.3
  if (elapsed < boundary) return 'dropping'
  for (let bounce = 0; bounce < 3; bounce++) {
    boundary += motion.bounceUpMs[bounce] + motion.bounceDownMs[bounce]
    if (elapsed < boundary) return `bounce-${bounce + 1}` as DicePhase
  }
  return elapsed < motion.totalMs ? 'settling' : 'landed'
}

function dicePose(elapsed: number, motion: DiceMotion, index: number, dieHeight: number, spinStartProgress: number): DicePose {
  const variation = DICE_VARIATION[index]
  const finalAngle = TILE_SETTLE_OFFSETS[index].rotate
  const finalSpinAngle = variation.direction * variation.turns * 360 + finalAngle
  const responsiveSpin = Math.max(-8, Math.min(8, (motion.distancePx - 633) * 0.025))
  const impactSpinAngle = variation.direction * (variation.impactSpin + responsiveSpin)
  const landingY = motion.distancePx + dieHeight * TILE_SETTLE_OFFSETS[index].dy / 100
  const fallMs = motion.fallMs - motion.staggerMs[index] * 0.7
  const driftPx = motion.reduced ? 0 : variation.drift * motion.distancePx / 633
  let time = elapsed - motion.staggerMs[index]
  if (time <= 0) return { x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1 }

  if (time < fallMs) {
    const progress = clamp01(time / fallMs)
    const dropProgress = Math.pow(progress, GRAVITY_POWER)
    const scale = 1 - (1 - FINAL_DICE_SCALE) * Math.pow(dropProgress, 1.2)
    const spinProgress = clamp01((progress - spinStartProgress) / (1 - spinStartProgress))
    const angle = motion.reduced ? 0 : impactSpinAngle * Math.pow(spinProgress, SPIN_POWER)
    const squash = motion.reduced ? 0 : clamp01((progress - 0.94) / 0.06)
    const drift = driftPx * (1 - (1 - progress) ** 2)
    return {
      x: motion.reduced ? 0 : guardedDrift(index, angle, drift, dieHeight),
      y: landingY * dropProgress,
      angle,
      scaleX: scale * (1 + 0.04 * squash),
      scaleY: scale * (1 - 0.06 * squash),
    }
  }

  time -= fallMs
  if (motion.reduced) {
    const progress = clamp01(time / motion.settleMs)
    return { x: 0, y: landingY, angle: mix(0, finalAngle, progress), scaleX: FINAL_DICE_SCALE, scaleY: FINAL_DICE_SCALE }
  }

  const firstBounce = motion.distancePx * 0.16 * variation.bounce
  const heights = [firstBounce, firstBounce * 0.45, firstBounce * 0.2]
  const spinAngles = [
    impactSpinAngle,
    mix(impactSpinAngle, finalSpinAngle, 0.68),
    mix(impactSpinAngle, finalSpinAngle, 0.91),
    mix(impactSpinAngle, finalSpinAngle, 0.98),
    finalSpinAngle,
  ]
  const impactDrift = [1, 0.7, 0.4, 0.2]
  const apexDrift = [0.85, 0.55, 0.3]
  const squashX = [0.04, 0.025, 0.012, 0.008]
  const squashY = [0.06, 0.035, 0.018, 0.012]

  for (let bounce = 0; bounce < 3; bounce++) {
    const upMs = motion.bounceUpMs[bounce]
    if (time < upMs) {
      const progress = clamp01(time / upMs)
      const rotationProgress = (time / (upMs + motion.bounceDownMs[bounce]))
      const angle = mix(spinAngles[bounce], spinAngles[bounce + 1], 1 - (1 - rotationProgress) ** 2)
      const bounceScale = FINAL_DICE_SCALE + 0.01 * (1 - bounce * 0.4) * Math.sin(Math.PI * rotationProgress)
      const releaseSquash = 1 - clamp01(progress / 0.25)
      const drift = driftPx * mix(impactDrift[bounce], apexDrift[bounce], progress)
      return {
        x: guardedDrift(index, angle, drift, dieHeight),
        y: landingY - heights[bounce] * (1 - (1 - progress) ** 2),
        angle,
        scaleX: bounceScale * (1 + squashX[bounce] * releaseSquash),
        scaleY: bounceScale * (1 - squashY[bounce] * releaseSquash),
      }
    }
    time -= upMs

    const downMs = motion.bounceDownMs[bounce]
    if (time < downMs) {
      const progress = clamp01(time / downMs)
      const rotationProgress = (upMs + time) / (upMs + downMs)
      const angle = mix(spinAngles[bounce], spinAngles[bounce + 1], 1 - (1 - rotationProgress) ** 2)
      const bounceScale = FINAL_DICE_SCALE + 0.01 * (1 - bounce * 0.4) * Math.sin(Math.PI * rotationProgress)
      const impactSquash = clamp01((progress - 0.85) / 0.15)
      const drift = driftPx * mix(apexDrift[bounce], impactDrift[bounce + 1], progress)
      return {
        x: guardedDrift(index, angle, drift, dieHeight),
        y: landingY - heights[bounce] * (1 - progress ** 2),
        angle,
        scaleX: bounceScale * (1 + squashX[bounce + 1] * impactSquash),
        scaleY: bounceScale * (1 - squashY[bounce + 1] * impactSquash),
      }
    }
    time -= downMs
  }

  const progress = clamp01(time / motion.settleMs)
  const angle = mix(spinAngles[3], spinAngles[4], 1 - (1 - progress) ** 2)
  const drift = mix(driftPx * impactDrift[3], 0, progress)
  return {
    x: guardedDrift(index, angle, drift, dieHeight, 1 - progress),
    y: landingY,
    angle,
    scaleX: FINAL_DICE_SCALE * mix(1 + squashX[3], 1, progress),
    scaleY: FINAL_DICE_SCALE * mix(1 - squashY[3], 1, progress),
  }
}

export default function PlayColorGamePage() {
  const [tiles, setTiles] = useState<ComboSymbol[]>(INITIAL_TILES)
  const [machineState, setMachineState] = useState<MachineState>('idle')
  const [dicePhase, setDicePhase] = useState<DicePhase>('waiting')
  const [resultPhase, setResultPhase] = useState<ResultPhase>('none')
  const [networkState, setNetworkState] = useState<NetworkState>('idle')
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const [roundActive, setRoundActive] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  const timings = prefersReducedMotion ? REDUCED_TIMINGS : DEFAULT_TIMINGS

  const stageRef = useRef<HTMLDivElement>(null)
  const diceRefs = useRef<(HTMLDivElement | null)[]>([])
  const diceFrameRef = useRef<number | null>(null)
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null)
  const claimButtonRef = useRef<HTMLButtonElement>(null)
  const stopSwapsRef = useRef<(() => void) | null>(null)
  const machineTimersRef = useRef<number[]>([])
  const revealTimerRef = useRef<number | null>(null)

  const machineStateRef = useRef<MachineState>('idle')
  const roundLockRef = useRef(false)
  const failedRoundRef = useRef(false)
  const diceLandedRef = useRef(false)
  const pendingOutcomeRef = useRef<RoundOutcome | null>(null)
  const revealQueuedRef = useRef(false)

  const dragPointerRef = useRef<number | null>(null)
  const dragStartYRef = useRef(0)
  const hasTriggeredThisPullRef = useRef(false)
  const pullCurrentRef = useRef(0)
  const pullTargetRef = useRef(0)
  const pullFrameRef = useRef<number | null>(null)

  const updateMachineState = useCallback((next: MachineState) => {
    machineStateRef.current = next
    setMachineState(next)
  }, [])

  const clearTimerList = useCallback((timerRef: React.MutableRefObject<number[]>) => {
    for (const timer of timerRef.current) window.clearTimeout(timer)
    timerRef.current = []
  }, [])

  const clearRoundTimers = useCallback(() => {
    clearTimerList(machineTimersRef)
    if (diceFrameRef.current != null) {
      window.cancelAnimationFrame(diceFrameRef.current)
      diceFrameRef.current = null
    }
    if (revealTimerRef.current != null) {
      window.clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
  }, [clearTimerList])

  const resetDiceTransforms = useCallback(() => {
    for (const die of diceRefs.current) {
      if (die) die.style.transform = ''
    }
  }, [])

  const startPullAnimation = useCallback(() => {
    if (pullFrameRef.current != null) return

    const tick = () => {
      const distance = pullTargetRef.current - pullCurrentRef.current
      const easing = prefersReducedMotion
        ? 1
        : machineStateRef.current === 'closing'
          ? 0.16
          : machineStateRef.current === 'open'
            ? 0.22
            : 0.28
      const next = Math.abs(distance) < 0.15
        ? pullTargetRef.current
        : pullCurrentRef.current + distance * easing
      const progress = Math.min(1, Math.max(0, next / FIGMA_OPEN_PULL_PX))
      const visualPull = next * ((stageRef.current?.clientWidth ?? 440) / 440)

      pullCurrentRef.current = next
      stageRef.current?.style.setProperty('--pull-y', `${visualPull}px`)
      stageRef.current?.style.setProperty('--pull-progress', `${progress}`)
      stageRef.current?.style.setProperty('--rope-scale', `${1 + progress * 0.24}`)

      if (next === pullTargetRef.current) {
        pullFrameRef.current = null
        return
      }
      pullFrameRef.current = window.requestAnimationFrame(tick)
    }

    pullFrameRef.current = window.requestAnimationFrame(tick)
  }, [prefersReducedMotion])

  const setPullTarget = useCallback((value: number) => {
    pullTargetRef.current = value
    startPullAnimation()
  }, [startPullAnimation])

  const revealWhenReady = useCallback(() => {
    const resolved = pendingOutcomeRef.current
    if (!diceLandedRef.current || !resolved || revealQueuedRef.current) return

    revealQueuedRef.current = true
    stopSwapsRef.current?.()
    stopSwapsRef.current = null

    setTiles(
      resolved.result === 'win' || resolved.result === 'laki' || resolved.result === 'clover'
        ? [resolved.result, resolved.result, resolved.result]
        : nonMatchingArrangement()
    )
    setOutcome(resolved)
    setResultPhase('ready')

    revealTimerRef.current = window.setTimeout(() => {
      setResultPhase('visible')
      setRoundActive(false)
      playWinChime()
      playConfettiPop()
      playApplause()
    }, timings.revealDelay)
  }, [timings])

  const beginDiceSequence = useCallback((motion: DiceMotion) => {
    setDicePhase('dropping')
    stopSwapsRef.current?.()
    stopSwapsRef.current = scheduleSpinTicks(motion.totalMs, () => {
      setTiles([randomSymbol(), randomSymbol(), randomSymbol()])
    })

    const dieBounds = diceRefs.current.map((die) => die?.getBoundingClientRect())
    const dieHeights = dieBounds.map((bounds) => bounds?.height ?? 0)
    const stageBounds = stageRef.current?.getBoundingClientRect()
    // A die starts spinning as its lower edge emerges below the open gate.
    const gateBottom = (stageBounds?.top ?? 0) + (stageBounds?.height ?? 956) * 0.161
    const spinStarts = dieBounds.map((bounds) => Math.min(0.8, Math.pow(
      clamp01(Math.max(0, gateBottom - (bounds?.bottom ?? gateBottom)) / motion.distancePx),
      1 / GRAVITY_POWER
    )))
    let startedAt: number | null = null
    let shownPhase: DicePhase = 'dropping'

    const tick = (now: number) => {
      startedAt ??= now
      const elapsed = Math.min(now - startedAt, motion.totalMs)

      diceRefs.current.forEach((die, index) => {
        if (!die) return
        const pose = dicePose(elapsed, motion, index, dieHeights[index], spinStarts[index])
        die.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${pose.angle}deg) scale(${pose.scaleX}, ${pose.scaleY})`
      })

      const phase = dicePhaseAt(elapsed, motion)
      if (phase !== shownPhase) {
        shownPhase = phase
        setDicePhase(phase)
      }

      if (elapsed >= motion.totalMs) {
        diceFrameRef.current = null
        diceLandedRef.current = true
        revealWhenReady()
        return
      }
      diceFrameRef.current = window.requestAnimationFrame(tick)
    }

    diceFrameRef.current = window.requestAnimationFrame(tick)
  }, [revealWhenReady])

  const failRound = useCallback((message: string) => {
    console.error('Color Game round failed:', message)
    failedRoundRef.current = true
    pendingOutcomeRef.current = null
    stopSwapsRef.current?.()
    stopSwapsRef.current = null
    if (diceFrameRef.current != null) {
      window.cancelAnimationFrame(diceFrameRef.current)
      diceFrameRef.current = null
    }
    resetDiceTransforms()
    setDicePhase('waiting')
    setTiles(INITIAL_TILES)
    setNetworkState('error')
    setPlayError(message)
    setRoundActive(false)

    if (machineStateRef.current === 'idle') {
      roundLockRef.current = false
    }
  }, [resetDiceTransforms])

  const triggerRound = useCallback(() => {
    if (roundLockRef.current) return

    roundLockRef.current = true
    failedRoundRef.current = false
    diceLandedRef.current = false
    pendingOutcomeRef.current = null
    revealQueuedRef.current = false

    clearRoundTimers()
    setPlayError(null)
    setOutcome(null)
    setResultPhase('none')
    setNetworkState('requesting')
    setRoundActive(true)

    const stageRect = stageRef.current?.getBoundingClientRect()
    const stageHeight = stageRect?.height ?? 956
    const diceReleaseAt = timings.machineOpen * 0.75
    const startBounds = diceRefs.current[0]?.getBoundingClientRect()
    const startTop = startBounds?.top ?? (stageRect?.top ?? 0) + stageHeight * 0.035
    const startWithinStage = startTop - (stageRect?.top ?? 0)
    const motion = createDiceMotion(stageHeight, startWithinStage, startBounds?.height ?? stageHeight * 0.06, prefersReducedMotion)
    const gateClearProgress = clamp01((stageHeight * 0.169 - startWithinStage) / motion.distancePx)
    const gateClearMs = Math.max(...motion.staggerMs.map((delay) =>
      delay + (motion.fallMs - delay * 0.7) * Math.pow(gateClearProgress, 1 / GRAVITY_POWER)
    ))
    const closeAt = Math.max(
      timings.machineOpen + timings.machineHold,
      diceReleaseAt + gateClearMs + 40
    )
    const idleAt = closeAt + timings.machineClose

    updateMachineState('open')
    setPullTarget(FIGMA_OPEN_PULL_PX)

    machineTimersRef.current.push(
      window.setTimeout(() => {
        if (!failedRoundRef.current) beginDiceSequence(motion)
      }, diceReleaseAt),
      window.setTimeout(() => {
        updateMachineState('closing')
        setPullTarget(0)
      }, closeAt),
      window.setTimeout(() => {
        updateMachineState('idle')
        if (failedRoundRef.current) roundLockRef.current = false
      }, idleAt)
    )

    void (async () => {
      try {
        const response = await fetch('/api/color-game/play', { method: 'POST' })
        const data: unknown = await response.json()
        const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}

        if (!response.ok) {
          failRound(typeof payload.error === 'string' ? payload.error : 'Something went wrong — please try again.')
          return
        }

        if (!isPlayResult(payload.result) || !isPrize(payload.prize)) {
          failRound('The game server returned an invalid result.')
          return
        }

        pendingOutcomeRef.current = { result: payload.result, prize: payload.prize }
        setNetworkState('success')
        revealWhenReady()
      } catch (error: unknown) {
        failRound(errorMessage(error))
      }
    })()
  }, [beginDiceSequence, clearRoundTimers, failRound, prefersReducedMotion, revealWhenReady, setPullTarget, timings, updateMachineState])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => {
      setPrefersReducedMotion(media.matches)
    }
    updatePreference()
    media.addEventListener('change', updatePreference)
    return () => media.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => {
    if (resultPhase !== 'visible' || prefersReducedMotion) return
    const canvas = confettiCanvasRef.current
    if (!canvas) return
    return launchConfetti(canvas)
  }, [prefersReducedMotion, resultPhase])

  useEffect(() => {
    if (resultPhase !== 'visible') return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => {
      claimButtonRef.current?.focus({ preventScroll: true })
    }, prefersReducedMotion ? 0 : 750)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
    }
  }, [prefersReducedMotion, resultPhase])

  useEffect(() => {
    return () => {
      stopSwapsRef.current?.()
      clearRoundTimers()
      if (pullFrameRef.current != null) window.cancelAnimationFrame(pullFrameRef.current)
    }
  }, [clearRoundTimers])

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (roundLockRef.current || machineStateRef.current !== 'idle') return

    dragPointerRef.current = event.pointerId
    dragStartYRef.current = event.clientY
    hasTriggeredThisPullRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    updateMachineState('pulling')
  }

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragPointerRef.current !== event.pointerId || hasTriggeredThisPullRef.current) return

    const pull = resistedPull(event.clientY - dragStartYRef.current)
    setPullTarget(pull)

    if (pull / FIGMA_OPEN_PULL_PX < PULL_TRIGGER_PROGRESS) return

    hasTriggeredThisPullRef.current = true
    dragPointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    triggerRound()
  }

  const finishPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragPointerRef.current !== event.pointerId) return

    dragPointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (!hasTriggeredThisPullRef.current) {
      updateMachineState('idle')
      setPullTarget(0)
    }
  }

  const dismissReveal = useCallback(() => {
    if (resultPhase !== 'visible') return

    setResultPhase('none')
    setOutcome(null)
    resetDiceTransforms()
    setDicePhase('waiting')
    setTiles(INITIAL_TILES)
    setNetworkState('idle')
    setPlayError(null)
    pendingOutcomeRef.current = null
    diceLandedRef.current = false
    revealQueuedRef.current = false
    roundLockRef.current = false
    failedRoundRef.current = false
    setPullTarget(0)
  }, [resetDiceTransforms, resultPhase, setPullTarget])

  const diceRolling = dicePhase !== 'waiting'
  const overlayVisible = resultPhase === 'visible' && outcome != null
  const rolledLine = `You rolled: ${tiles.map((symbol) => symbol.toUpperCase()).join(' • ')}`

  return (
    <main className={styles.page}>
      <div
        ref={stageRef}
        className={styles.stage}
        inert={overlayVisible}
        aria-hidden={overlayVisible}
        data-machine={machineState}
        data-dice={dicePhase}
        data-network={networkState}
        style={{ '--pull-y': '0px', '--pull-progress': '0', '--rope-scale': '1' } as React.CSSProperties}
      >
        <Image
          src={BOARD_ASSETS.back}
          alt=""
          fill
          priority
          sizes="(max-width: 440px) 100vw, 440px"
          className={styles.boardBack}
        />
        <div className={styles.ropeStrand} aria-hidden="true" />
        <div className={styles.diceChamber}>
          <div
            className={styles.diceGroup}
            aria-hidden={!diceRolling}
          >
            {tiles.map((symbol, index) => (
                <div
                  key={index}
                  ref={(die) => { diceRefs.current[index] = die }}
                  className={styles.die}
                >
                  <Image src={SYMBOL_ART[symbol]} alt="" fill sizes="90px" />
                </div>
            ))}
          </div>
        </div>
        <Image
          src={BOARD_ASSETS.frontDefault}
          alt=""
          fill
          priority
          sizes="(max-width: 440px) 100vw, 440px"
          className={`${styles.boardState} ${styles.boardDefault}`}
        />
        <Image
          src={BOARD_ASSETS.frontOpen}
          alt=""
          fill
          priority
          sizes="(max-width: 440px) 100vw, 440px"
          className={`${styles.boardState} ${styles.boardOpen}`}
        />
        <Image
          src={BOARD_ASSETS.ring}
          alt=""
          fill
          priority
          sizes="440px"
          className={styles.ringArt}
        />

        <button
          type="button"
          className={styles.ringTarget}
          aria-label="Pull the metal ring down to play"
          aria-disabled={roundActive || resultPhase !== 'none'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
        />

        <nav className={styles.navigation} aria-label="Color Game navigation">
          <Link href="/" aria-label="Back to games" className={styles.navButton}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12H5M5 12l6-6M5 12l6 6" />
            </svg>
          </Link>
          <Link href="/admin/color-game" aria-label="Manage Color Game prizes" className={styles.navButton}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </Link>
        </nav>

        {playError && (
          <p className={styles.error} role="alert">{playError}</p>
        )}

        <p className={styles.instructions} aria-live="polite">
          {roundActive ? 'The dice are rolling' : resultPhase === 'none' ? 'Pull the ring to play' : 'Prize ready'}
        </p>
      </div>

      {overlayVisible && (
        <div
          className={styles.resultOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="color-game-reward-title"
          aria-describedby="color-game-reward-roll"
        >
          <div className={styles.rewardRays} aria-hidden="true" />
          <canvas ref={confettiCanvasRef} className={styles.confettiCanvas} aria-hidden="true" />
          <div className={styles.rewardScene}>
            <span className={`${styles.rewardSparkle} ${styles.sparkleOne}`} aria-hidden="true" />
            <span className={`${styles.rewardSparkle} ${styles.sparkleTwo}`} aria-hidden="true" />
            <span className={`${styles.rewardSparkle} ${styles.sparkleThree}`} aria-hidden="true" />
            <span className={`${styles.rewardSparkle} ${styles.sparkleFour}`} aria-hidden="true" />
            <div className={styles.rewardRibbon}>
              <h2 id="color-game-reward-title" className={styles.rewardHeading}>CONGRATULATIONS!</h2>
            </div>
            <p className={styles.rewardSubtitle}>HERE’S YOUR PRIZE</p>
            <div className={styles.rewardHero}>
              <strong className={styles.rewardPrize}>MERCHANDISE</strong>
            </div>
            {outcome.prize.name.toUpperCase() !== 'MERCHANDISE' && (
              <p className={styles.rewardPrizeName}>{outcome.prize.name}</p>
            )}
            <p id="color-game-reward-roll" className={styles.rewardRoll}>{rolledLine}</p>
            <button ref={claimButtonRef} type="button" onClick={dismissReveal} className={styles.claimButton}>
              CLAIM
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
