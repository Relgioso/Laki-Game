import type { ComponentType } from 'react'
import type { Mechanic } from '@/lib/games'
import Pachinko from './pachinko'
import type { MechanicProps } from './types'

// Board component + button wording for each shared-platform mechanic.
export const MECHANICS: Record<Mechanic, { component: ComponentType<MechanicProps>; actionLabel: string; busyLabel: string }> = {
  pachinko: { component: Pachinko, actionLabel: 'Drop', busyLabel: 'Dropping…' },
}
