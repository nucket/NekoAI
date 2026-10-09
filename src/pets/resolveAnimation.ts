// ─── Animation resolver ───────────────────────────────────────────────────────
// Single source of truth for which sprite plays, with two firm rules:
//   1. notificationAlert always wins (pet was teleported to notify the user).
//   2. While WALKING, the directional walk_* animation is sacred — only the
//      edge-hit scratch override is allowed (classic Neko "scratches the wall"
//      behaviour). Idle sequencer / mood / wake flashes never pre-empt a walk.
// Otherwise: edge scratch > click wake > pet.json trigger (chat open, AI
// thinking/response, OS idle) > idle sequencer > mood > movement default.

export interface ResolveAnimationArgs {
  petState: 'IDLE' | 'WALKING' | 'NEAR_CURSOR' | 'SLEEPING'
  notificationAlert: boolean
  hasAlert: boolean
  edgeAnimOverride: string | null
  clickWakeAnim: string | null
  triggerAnim: string | null
  idleAnim: string | null
  moodOverride: string | null
  currentAnimation: string
}

export function resolveAnimation({
  petState,
  notificationAlert,
  hasAlert,
  edgeAnimOverride,
  clickWakeAnim,
  triggerAnim,
  idleAnim,
  moodOverride,
  currentAnimation,
}: ResolveAnimationArgs): string {
  if (notificationAlert) return hasAlert ? 'alert' : 'idle'
  if (petState === 'WALKING') return edgeAnimOverride ?? currentAnimation
  return (
    edgeAnimOverride ?? clickWakeAnim ?? triggerAnim ?? idleAnim ?? moodOverride ?? currentAnimation
  )
}
