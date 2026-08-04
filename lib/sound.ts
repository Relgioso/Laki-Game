// Lightweight synthesized sound effects (Web Audio API) — no external audio
// files, so nothing to license or host. Swap these for real recorded sound
// effects later by replacing the internals of playSpinTick/playWinChime
// with an <audio>/decoded-buffer playback call; call sites don't need to change.

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  // Browsers suspend a freshly-created (or backgrounded) context until a user
  // gesture resumes it. Calling this from a click handler satisfies that.
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// A short mechanical "tick," like a wheel peg passing a pointer.
export function playSpinTick() {
  const audioCtx = getContext()
  if (!audioCtx) return
  const now = audioCtx.currentTime

  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(900, now)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035)

  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(now)
  osc.stop(now + 0.04)
}

// Schedules a decelerating series of ticks over `durationMs`, mimicking a
// wheel slowing to a stop — starts fast, ends slow. Returns a cancel function.
export function scheduleSpinTicks(durationMs: number): () => void {
  const audioCtx = getContext()
  if (!audioCtx) return () => {}

  const timers: number[] = []
  const start = performance.now()
  const minInterval = 45 // ms between ticks at the start (fast)
  const maxInterval = 260 // ms between ticks near the end (slow)

  function tick() {
    const elapsed = performance.now() - start
    const t = Math.min(1, elapsed / durationMs)
    // Ease-out curve so ticks slow down the same way the wheel visually does.
    const eased = 1 - Math.pow(1 - t, 3)
    playSpinTick()
    if (t >= 1) return
    const interval = minInterval + (maxInterval - minInterval) * eased
    timers.push(window.setTimeout(tick, interval))
  }
  timers.push(window.setTimeout(tick, 0))

  return () => {
    for (const id of timers) window.clearTimeout(id)
  }
}

// A short ascending four-note chime for a win reveal.
export function playWinChime() {
  const audioCtx = getContext()
  if (!audioCtx) return
  const now = audioCtx.currentTime
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6

  notes.forEach((freq, i) => {
    const startAt = now + i * 0.11
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, startAt)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.35)

    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start(startAt)
    osc.stop(startAt + 0.4)
  })
}
