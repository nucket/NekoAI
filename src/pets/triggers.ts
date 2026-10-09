import type { AnimationConfig, PetDefinition, TriggerEvent } from '../types/pet'

// ─── Pet triggers ─────────────────────────────────────────────────────────────
// Pure helpers behind the `triggers` block of pet.json. Who fires what:
//   • on_chat_open, on_ai_response — one-shot flashes (usePetTriggers)
//   • on_ai_thinking               — held while an AI request is in flight
//   • on_idle_3min/5min/6min       — OS idle thresholds; a looping animation
//                                    is held while idle, others flash once
//   • on_cursor_near               — greeting once the pet settles at the
//                                    cursor (useIdleSequencer)
//   • on_movement_start            — wake flash when the pet leaves a rest
//                                    (useIdleSequencer)
//   • on_edge_hit_*                — scratch at a screen edge (App)
//   • on_happy, on_surprised, on_eating — reserved, not fired yet

/** Shortest / longest time a one-shot trigger animation stays on screen. */
export const FLASH_MIN_MS = 400
export const FLASH_MAX_MS = 2000

type PetTriggers = Pick<PetDefinition, 'animations' | 'triggers'>

/**
 * The animation a pet maps to `event`, or null when the pet doesn't map it or
 * maps it to an animation it doesn't define.
 */
export function triggerAnimation(
  pet: PetTriggers | null | undefined,
  event: TriggerEvent
): string | null {
  const name = pet?.triggers?.[event]
  return name && pet?.animations?.[name] ? name : null
}

/** One full pass of the animation, clamped to [FLASH_MIN_MS, FLASH_MAX_MS]. */
export function flashDurationMs(anim: AnimationConfig | undefined): number {
  if (!anim || !(anim.fps > 0) || anim.files.length === 0) return FLASH_MIN_MS
  const ms = (anim.files.length / anim.fps) * 1000
  return Math.round(Math.min(FLASH_MAX_MS, Math.max(FLASH_MIN_MS, ms)))
}

export type IdleTrigger = 'on_idle_3min' | 'on_idle_5min' | 'on_idle_6min'

const IDLE_THRESHOLDS: ReadonlyArray<[minutes: number, trigger: IdleTrigger]> = [
  [6, 'on_idle_6min'],
  [5, 'on_idle_5min'],
  [3, 'on_idle_3min'],
]

/** The highest OS-idle threshold reached, or null below 3 minutes. */
export function idleTriggerFor(idleMinutes: number): IdleTrigger | null {
  for (const [minutes, trigger] of IDLE_THRESHOLDS) {
    if (idleMinutes >= minutes) return trigger
  }
  return null
}
