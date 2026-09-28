'use client'

import { useEffect, useRef, useState } from 'react'
import { PACHINKO_ROWS, pegColumns, planPachinkoPath, slotLabel } from '@/lib/pachinko-path'
import { playSpinTick } from '@/lib/sound'
import type { MechanicProps } from './types'

// Board geometry in SVG units (viewBox 0 0 100 150). The path planner's
// normalized x (0..1) is scaled by 100.
const PEG_TOP = 16
const ROW_GAP = 8.5
const PEG_R = 1.2
const BALL_R = 2.4
const SLOT_TOP = PEG_TOP + PACHINKO_ROWS * ROW_GAP + 4
const SLOT_BOTTOM = 146
const START = { x: 50, y: 5 }

const pegY = (row: number) => PEG_TOP + row * ROW_GAP
// Ball resting on top of a peg in this row.
const restY = (row: number) => pegY(row) - PEG_R - BALL_R

type Segment = { x0: number; y0: number; x1: number; y1: number; hop: number; ms: number; tick: boolean }

function buildSegments(xs: number[], slotCount: number, slot: number): Segment[] {
  const segments: Segment[] = [{ x0: START.x, y0: START.y, x1: xs[0] * 100, y1: restY(0), hop: 0, ms: 450, tick: true }]
  for (let r = 0; r < PACHINKO_ROWS - 1; r++) {
    segments.push({ x0: xs[r] * 100, y0: restY(r), x1: xs[r + 1] * 100, y1: restY(r + 1), hop: 3, ms: 360, tick: true })
  }
  const last = PACHINKO_ROWS - 1
  const exitX = xs[PACHINKO_ROWS] * 100
  segments.push({ x0: xs[last] * 100, y0: restY(last), x1: exitX, y1: SLOT_TOP, hop: 3, ms: 360, tick: false })
  const slotCenter = ((slot + 0.5) / slotCount) * 100
  segments.push({ x0: exitX, y0: SLOT_TOP, x1: slotCenter, y1: SLOT_BOTTOM - BALL_R - 1, hop: 0, ms: 450, tick: false })
  return segments
}

export default function Pachinko({ prizes, target, onFinished }: MechanicProps) {
  const [ball, setBall] = useState(START)
  const [landedSlot, setLandedSlot] = useState<number | null>(null)
  const onFinishedRef = useRef(onFinished)
  useEffect(() => {
    onFinishedRef.current = onFinished
  })

  const runId = target?.runId
  useEffect(() => {
    if (!target) return
    const slot = prizes.findIndex((p) => p.id === target.prizeId)
    if (slot === -1) {
      // The prize list changed since this screen loaded (admin edit). Skip
      // the animation but still let the shell reveal the prize.
      onFinishedRef.current()
      return
    }
    const segments = buildSegments(planPachinkoPath(slot, prizes.length), prizes.length, slot)
    let i = 0
    let segmentStart: number | null = null
    let raf = 0
    const frame = (now: number) => {
      if (segmentStart === null) {
        segmentStart = now
        setLandedSlot(null)
      }
      let seg = segments[i]
      let t = (now - segmentStart) / seg.ms
      while (t >= 1) {
        if (seg.tick) playSpinTick()
        i++
        if (i >= segments.length) {
          setBall({ x: seg.x1, y: seg.y1 })
          setLandedSlot(slot)
          onFinishedRef.current()
          return
        }
        segmentStart += seg.ms
        seg = segments[i]
        t = (now - segmentStart) / seg.ms
      }
      // x moves evenly; y accelerates like gravity, with a small hop after each peg.
      setBall({ x: seg.x0 + (seg.x1 - seg.x0) * t, y: seg.y0 + (seg.y1 - seg.y0) * t * t - seg.hop * 4 * t * (1 - t) })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // Only a new drop (runId) restarts the animation -- not the prize list
    // refreshing after a win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  const slotWidth = 100 / Math.max(prizes.length, 1)

  return (
    <div className="w-full rounded-2xl border-4 border-black bg-black p-2 shadow-[0_6px_0_#cc9700]">
      <svg viewBox="0 0 100 150" className="block h-auto w-full" data-landed-slot={landedSlot ?? undefined}>
        <defs>
          <linearGradient id="pachinko-board" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe45c" />
            <stop offset="100%" stopColor="#fad403" />
          </linearGradient>
          <radialGradient id="pachinko-ball" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#d4d4d8" />
            <stop offset="100%" stopColor="#71717a" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="150" rx="4" fill="url(#pachinko-board)" />
        {Array.from({ length: PACHINKO_ROWS }, (_, row) =>
          pegColumns(row).map((x) => <circle key={`${row}-${x}`} cx={x * 100} cy={pegY(row)} r={PEG_R} fill="#1a1a1a" />)
        )}
        {prizes.map((prize, i) => {
          const x = i * slotWidth
          const landed = landedSlot === i
          const labelX = x + slotWidth / 2
          // Start above the resting ball so it never covers the label.
          const labelY = SLOT_BOTTOM - 8
          return (
            <g key={prize.id}>
              <rect x={x} y={SLOT_TOP} width={slotWidth} height={SLOT_BOTTOM - SLOT_TOP} fill={landed ? '#000' : i % 2 ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.16)'} />
              {i > 0 && <line x1={x} y1={SLOT_TOP - 3} x2={x} y2={SLOT_BOTTOM} stroke="#000" strokeWidth={0.8} />}
              <text
                x={labelX}
                y={labelY}
                transform={`rotate(-90 ${labelX} ${labelY})`}
                dominantBaseline="middle"
                fontSize={3.8}
                fontWeight={800}
                fill={landed ? '#fad403' : '#000'}
              >
                {slotLabel(prize.name)}
              </text>
            </g>
          )
        })}
        <circle cx={ball.x} cy={ball.y} r={BALL_R} fill="url(#pachinko-ball)" stroke="#3f3f46" strokeWidth={0.4} />
      </svg>
    </div>
  )
}
