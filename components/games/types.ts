import type { ApiPrize } from '@/lib/prize-config'

// A drop/spin/race the server has already decided. runId changes every play
// so the same prize twice in a row still starts a new animation.
export type DropTarget = { prizeId: string; runId: number }

// Every shared-platform game's board implements this. With target null it
// renders still (that's also the admin preview); with a target it animates
// to that prize and then calls onFinished exactly once.
export type MechanicProps = {
  prizes: ApiPrize[]
  target: DropTarget | null
  onFinished: () => void
}
