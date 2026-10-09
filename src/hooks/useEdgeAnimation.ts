import { useCallback } from 'react'
import type { PetDefinition } from '../types/pet'
import { useTimedValue } from './useTimedValue'

export type EdgeAnimationKind = 'scratch' | 'yawn' | 'idle'
export type EdgeDirection = 'right' | 'left' | 'up' | 'down'

/**
 * Edge animation dispatcher, invoked by the movement hook's edge state machine.
 * Resolves the right sprite for each phase and shows it as an override for
 * `durationMs`; the pet is frozen on the movement side for the same duration,
 * so animation and position stay in sync. `set` lets other sequences (the
 * onboarding walk-out) drive the same override slot.
 */
export function useEdgeAnimation(petDef: PetDefinition | null) {
  const { value: edgeAnimOverride, show, set } = useTimedValue<string>()

  const handleEdgeAnimation = useCallback(
    (kind: EdgeAnimationKind, direction: EdgeDirection, durationMs: number) => {
      if (!petDef) return
      let animName: string | null = null
      if (kind === 'scratch') {
        animName = petDef.triggers?.[`on_edge_hit_${direction}`] ?? null
      } else if (kind === 'yawn') {
        animName = petDef.animations?.yawn ? 'yawn' : null
      } else if (kind === 'idle') {
        animName = 'idle'
      }
      if (!animName || !petDef.animations?.[animName]) return
      show(animName, durationMs)
    },
    [petDef, show]
  )

  return { edgeAnimOverride, setEdgeAnimOverride: set, handleEdgeAnimation }
}
