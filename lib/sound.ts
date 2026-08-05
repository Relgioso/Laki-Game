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
// `onTick`, if given, fires alongside every tick (e.g. to drive a matching
// visual pointer-bounce) so the sound and the animation never drift apart —
// one schedule drives both.
export function scheduleSpinTicks(durationMs: number, onTick?: () => void): () => void {
  const audioCtx = getContext()
  const timers: number[] = []
  const start = performance.now()
  const minInterval = 45 // ms between ticks at the start (fast)
  const maxInterval = 260 // ms between ticks near the end (slow)

  function tick() {
    const elapsed = performance.now() - start
    const t = Math.min(1, elapsed / durationMs)
    // Ease-out curve so ticks slow down the same way the wheel visually does.
    const eased = 1 - Math.pow(1 - t, 3)
    if (audioCtx) playSpinTick()
    onTick?.()
    if (t >= 1) return
    const interval = minInterval + (maxInterval - minInterval) * eased
    timers.push(window.setTimeout(tick, interval))
  }
  timers.push(window.setTimeout(tick, 0))

  return () => {
    for (const id of timers) window.clearTimeout(id)
  }
}

// A short "pop" burst (like a party popper) plus a few high crackle ticks,
// played alongside the confetti visual and the win chime on reveal.
export function playConfettiPop() {
  const audioCtx = getContext()
  if (!audioCtx) return
  const now = audioCtx.currentTime

  // Noise burst: a short buffer of random samples with a fast linear decay,
  // high-passed so it reads as a airy "pfft" rather than a dull thump.
  const duration = 0.25
  const bufferSize = Math.floor(audioCtx.sampleRate * duration)
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
  }

  const noise = audioCtx.createBufferSource()
  noise.buffer = buffer

  const filter = audioCtx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.setValueAtTime(800, now)

  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  noise.connect(filter)
  filter.connect(gain)
  gain.connect(audioCtx.destination)
  noise.start(now)
  noise.stop(now + duration)

  // A few quick high "crackle" ticks scattered right after the pop, for a
  // multi-piece confetti feel rather than one flat burst.
  ;[0.05, 0.09, 0.14].forEach((delay) => {
    const osc = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(1800 + Math.random() * 800, now + delay)
    g.gain.setValueAtTime(0.0001, now + delay)
    g.gain.exponentialRampToValueAtTime(0.08, now + delay + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.05)
    osc.connect(g)
    g.connect(audioCtx.destination)
    osc.start(now + delay)
    osc.stop(now + delay + 0.06)
  })
}

// A synthesized ambient crowd -- a continuous filtered-noise murmur plus
// scattered short "shout" bursts -- played during a race to build suspense.
// No recorded crowd samples; same noise-buffer + biquad-filter approach as
// playConfettiPop's noise burst, just longer and layered. Returns a cancel
// function so the caller can stop it early if the race ends sooner than
// expected (or is interrupted).
export function scheduleCrowdCheer(durationMs: number): () => void {
  const audioCtx = getContext()
  if (!audioCtx) return () => {}
  const now = audioCtx.currentTime
  const durationSec = durationMs / 1000
  const activeNodes: AudioScheduledSourceNode[] = []
  const timers: number[] = []
  let stopped = false

  // Continuous ambient murmur: one long buffer of filtered noise, gently
  // faded in/out, standing in for "distant crowd" underneath the shouts.
  const bufferSize = Math.floor(audioCtx.sampleRate * durationSec)
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }
  const murmurSource = audioCtx.createBufferSource()
  murmurSource.buffer = buffer

  const murmurFilter = audioCtx.createBiquadFilter()
  murmurFilter.type = 'bandpass'
  murmurFilter.frequency.setValueAtTime(500, now)
  murmurFilter.Q.setValueAtTime(0.6, now)

  const murmurGain = audioCtx.createGain()
  const fadeIn = Math.min(0.5, durationSec * 0.15)
  const fadeOut = Math.min(0.6, durationSec * 0.2)
  murmurGain.gain.setValueAtTime(0.0001, now)
  murmurGain.gain.exponentialRampToValueAtTime(0.05, now + fadeIn)
  murmurGain.gain.setValueAtTime(0.05, now + Math.max(fadeIn, durationSec - fadeOut))
  murmurGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec)

  murmurSource.connect(murmurFilter)
  murmurFilter.connect(murmurGain)
  murmurGain.connect(audioCtx.destination)
  murmurSource.start(now)
  murmurSource.stop(now + durationSec)
  activeNodes.push(murmurSource)

  // Individual "shout" bursts scattered across the race -- short bandpass-
  // filtered noise pops at randomized pitch/timing, reading as scattered
  // cheers on top of the ambient murmur.
  function shout() {
    const shoutCtx = getContext()
    if (!shoutCtx) return
    const t = shoutCtx.currentTime
    const shoutDuration = 0.15 + Math.random() * 0.15

    const shoutBufferSize = Math.floor(shoutCtx.sampleRate * shoutDuration)
    const shoutBuffer = shoutCtx.createBuffer(1, shoutBufferSize, shoutCtx.sampleRate)
    const shoutData = shoutBuffer.getChannelData(0)
    for (let i = 0; i < shoutBufferSize; i++) {
      shoutData[i] = (Math.random() * 2 - 1) * (1 - i / shoutBufferSize)
    }
    const shoutSource = shoutCtx.createBufferSource()
    shoutSource.buffer = shoutBuffer

    const shoutFilter = shoutCtx.createBiquadFilter()
    shoutFilter.type = 'bandpass'
    shoutFilter.frequency.setValueAtTime(300 + Math.random() * 700, t)
    shoutFilter.Q.setValueAtTime(1.5, t)

    const shoutGain = shoutCtx.createGain()
    shoutGain.gain.setValueAtTime(0.0001, t)
    shoutGain.gain.exponentialRampToValueAtTime(0.12 + Math.random() * 0.08, t + 0.02)
    shoutGain.gain.exponentialRampToValueAtTime(0.0001, t + shoutDuration)

    shoutSource.connect(shoutFilter)
    shoutFilter.connect(shoutGain)
    shoutGain.connect(shoutCtx.destination)
    shoutSource.start(t)
    shoutSource.stop(t + shoutDuration)
  }

  const start = performance.now()
  function scheduleNextShout() {
    if (stopped) return
    const elapsed = performance.now() - start
    if (elapsed >= durationMs - 300) return // no new shouts right at the very end
    shout()
    const nextIn = 200 + Math.random() * 350
    timers.push(window.setTimeout(scheduleNextShout, nextIn))
  }
  timers.push(window.setTimeout(scheduleNextShout, 150))

  return () => {
    stopped = true
    for (const id of timers) window.clearTimeout(id)
    for (const node of activeNodes) {
      try {
        node.stop()
      } catch {
        // Already stopped naturally -- fine to ignore.
      }
    }
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
