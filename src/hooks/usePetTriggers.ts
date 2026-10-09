import { useCallback, useEffect, useRef, useState } from 'react'
import type { PetDefinition, TriggerEvent } from '../types/pet'
import { flashDurationMs, idleTriggerFor, triggerAnimation } from '../pets/triggers'

export interface UsePetTriggersOptions {
  petDef: PetDefinition | null
  /** OS idle time from useDesktopContext. */
  idleMinutes: number
  /** True while an AI request is in flight. */
  aiThinking: boolean
}

/**
 * App-level pet triggers (see src/pets/triggers.ts for the full map).
 * Returns the animation they want on screen, in priority order:
 * one-shot flash > on_ai_thinking > on_idle_* — and `fire` for
 * event-style triggers.
 */
export function usePetTriggers({ petDef, idleMinutes, aiThinking }: UsePetTriggersOptions): {
  triggerAnim: string | null
  fire: (event: TriggerEvent) => void
} {
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fire = useCallback(
    (event: TriggerEvent) => {
      const anim = triggerAnimation(petDef, event)
      if (!anim || !petDef) return
      setFlash(anim)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(
        () => setFlash(null),
        flashDurationMs(petDef.animations[anim])
      )
    },
    [petDef]
  )

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    },
    []
  )

  // OS idle thresholds: a looping animation (e.g. sleep) is held for as long
  // as the user stays away; anything else (yawn, falling_asleep) plays once
  // when the threshold is crossed.
  const idleTrigger = idleTriggerFor(idleMinutes)
  const idleAnim = idleTrigger ? triggerAnimation(petDef, idleTrigger) : null
  const idleLoops = !!idleAnim && !!petDef?.animations[idleAnim]?.loop
  const [prevIdleTrigger, setPrevIdleTrigger] = useState(idleTrigger)
  const [idleFlash, setIdleFlash] = useState<string | null>(null)

  // Crossing a threshold is derived during render (no effect round-trip).
  if (idleTrigger !== prevIdleTrigger) {
    setPrevIdleTrigger(idleTrigger)
    setIdleFlash(idleAnim && !idleLoops ? idleAnim : null)
  }

  useEffect(() => {
    if (!idleFlash || !petDef) return
    const id = setTimeout(() => setIdleFlash(null), flashDurationMs(petDef.animations[idleFlash]))
    return () => clearTimeout(id)
  }, [idleFlash, petDef])

  const thinkingAnim = aiThinking ? triggerAnimation(petDef, 'on_ai_thinking') : null

  return {
    triggerAnim: flash ?? thinkingAnim ?? idleFlash ?? (idleLoops ? idleAnim : null),
    fire,
  }
}
