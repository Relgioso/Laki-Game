// Lightweight canvas confetti burst — no external library, matching this
// app's existing "synthesize effects in-house" approach (see lib/sound.ts)
// rather than pulling in a package for something this small. Draws small
// rotating rectangles in the brand palette, bursting outward/upward from
// roughly the center of the screen and falling under gravity, fading out
// near the end.

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  vr: number
  size: number
  color: string
}

const COLORS = ['#fad403', '#ffffff', '#1a1a1a', '#ff5c5c', '#4ade80']

// Returns a cancel function so the caller can stop/clear on unmount or when
// the reveal is dismissed early.
export function launchConfetti(canvas: HTMLCanvasElement, durationMs = 2600): () => void {
  const context = canvas.getContext('2d')
  if (!context) return () => {}
  // Rebind to a non-null-typed local -- TS doesn't retain the narrowing from
  // the guard above inside the `tick` closure defined further down.
  const ctx = context

  const dpr = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.scale(dpr, dpr)

  const count = 140
  const particles: Particle[] = Array.from({ length: count }, () => ({
    x: width / 2 + (Math.random() - 0.5) * width * 0.3,
    y: height * 0.35 + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 8,
    vy: -Math.random() * 9 - 3,
    rotation: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.3,
    size: 6 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }))

  const gravity = 0.28
  const start = performance.now()
  let frame = 0
  let stopped = false

  function tick(now: number) {
    if (stopped) return
    const t = (now - start) / durationMs
    ctx.clearRect(0, 0, width, height)

    for (const p of particles) {
      p.vy += gravity
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.vr
      p.vx *= 0.99

      const fade = t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }

    if (t < 1) {
      frame = requestAnimationFrame(tick)
    } else {
      ctx.clearRect(0, 0, width, height)
    }
  }
  frame = requestAnimationFrame(tick)

  return () => {
    stopped = true
    if (frame) cancelAnimationFrame(frame)
    ctx.clearRect(0, 0, width, height)
  }
}
