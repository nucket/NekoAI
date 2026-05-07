import { useEffect, useRef, useState } from 'react'
import type { PetState } from './usePetMovement'

// ─── Timing constants (ms) — faithful to original x11 Neko (125ms/tick) ───

const STOP_MS = 250 // original NIKAKI_TIME — pet stands still on arrival before grooming
const WASH_MS = 1250 // original JARE_TIME = 10 ticks × 125ms
const SCRATCH_MS = 500 // original KAKI_TIME = 4 ticks × 125ms
const YAWN_MS = 375 // original AKUBI_TIME = 3 ticks × 125ms
const AWAKE_MS = 375 // original AWAKE_TIME = 3 ticks × 125ms
const FALLING_ASLEEP_MS = 1500 // transition animation duration

const GROOM_AT_MS = 60_000 // 1 min → one-time groom (extended idle only)
const SLEEP_AT_MS = 30000 // ~30s after arriving at cursor before sleeping

// Past this phase, the pet has rested long enough that an "awaken" flash
// looks natural when the cursor moves again. Brief NEAR_CURSOR bumps (e.g.
// the cursor merely paused while the pet was still approaching) must NOT
// trigger a wake animation — that was the visible glitch where walk_* got
// pre-empted by 'awaken' mid-approach.
const WAKE_REQUIRED_PHASES = new Set<Phase>([
  'yawning',
  'resting',
  'falling_asleep',
  'sleeping',
  'groom_scratch',
  'groom_wash',
])

/** Random yawn interval while resting: 12–35 seconds (for extended idle) */
function yawnIntervalMs() {
  return 12000 + Math.random() * 23_000
}

// ─── Phase ────────────────────────────────────────────────────────────────────

type Phase =
  | 'stop'
  | 'wash'
  | 'scratch'
  | 'yawning'
  | 'falling_asleep'
  | 'sleeping'
  | 'resting'
  | 'groom_scratch'
  | 'groom_wash'

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Drives the classic Neko idle animation sequence while petState === 'NEAR_CURSOR'.
 *
 * Faithful to the original x11 Neko / Neko98 state machine:
 *   On arrival at cursor:
 *     stop (250ms idle settle) → wash (JARE, 1.25s) → scratch (KAKI, 0.5s)
 *       → yawn (AKUBI, 0.375s) → resting (periodic yawn / groom) → falling_asleep → sleep
 *
 * On departure (cursor moves away):
 *   → 'awaken' flash for ~375ms, but ONLY if the pet was past the wash phase
 *     (i.e. actually rested). This prevents the glitch where a brief
 *     NEAR_CURSOR bump during approach made the walking sprite freeze on
 *     'awaken' for 375ms.
 */
export function useIdleSequencer(petState: PetState, availableAnimations: string[]): string | null {
  const [anim, setAnim] = useState<string | null>(null)
  const [wakeAnim, setWakeAnim] = useState<string | null>(null)

  const availRef = useRef(availableAnimations)
  const activeRef = useRef(false)
  const prevState = useRef<PetState>(petState)
  const lastPhaseRef = useRef<Phase>('stop')

  // Wake-up flash timer
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    availRef.current = availableAnimations
  }, [availableAnimations])

  // ── Main idle sequence (runs while NEAR_CURSOR) ───────────────────────────
  useEffect(() => {
    if (petState !== 'NEAR_CURSOR') return

    const has = (a: string) => availRef.current.includes(a)
    const safe = (preferred: string, fallback = 'idle') => (has(preferred) ? preferred : fallback)

    let timerId: ReturnType<typeof setTimeout> | null = null
    const cancel = () => {
      if (timerId) {
        clearTimeout(timerId)
        timerId = null
      }
    }

    let phase: Phase = 'stop'
    lastPhaseRef.current = 'stop'
    let nearStart = Date.now()
    let groomed = false
    let nextYawnAt = 0

    function setPhase(next: Phase) {
      phase = next
      lastPhaseRef.current = next
    }

    function tick() {
      if (!activeRef.current) return

      const elapsed = Date.now() - nearStart

      switch (phase) {
        case 'stop':
          // Idle settle — pet just arrived, hold the idle frame briefly
          // before starting the grooming chain. A brief NEAR_CURSOR bounce
          // during approach exits here without ever showing 'wash'.
          setAnim(safe('idle'))
          setPhase('wash')
          timerId = setTimeout(tick, STOP_MS)
          break

        case 'wash':
          setAnim(safe('wash'))
          setPhase('scratch')
          timerId = setTimeout(tick, WASH_MS)
          break

        case 'scratch':
          setAnim(safe('scratch_wall'))
          setPhase('yawning')
          timerId = setTimeout(tick, SCRATCH_MS)
          break

        case 'yawning':
          setAnim(safe('yawn'))
          setPhase('resting')
          nextYawnAt = elapsed + yawnIntervalMs()
          timerId = setTimeout(tick, YAWN_MS)
          break

        case 'resting': {
          if (elapsed >= SLEEP_AT_MS) {
            setPhase('falling_asleep')
            setAnim(safe('falling_asleep', 'sleep'))
            timerId = setTimeout(tick, FALLING_ASLEEP_MS)
            return
          }
          if (!groomed && elapsed >= GROOM_AT_MS) {
            groomed = true
            setPhase('groom_scratch')
            timerId = setTimeout(tick, 0)
            return
          }
          if (elapsed >= nextYawnAt) {
            setPhase('yawning')
            setAnim(safe('yawn'))
            timerId = setTimeout(tick, YAWN_MS)
            return
          }
          setAnim(safe('idle'))
          const wait = Math.max(200, Math.min(nextYawnAt, GROOM_AT_MS, SLEEP_AT_MS) - elapsed)
          timerId = setTimeout(tick, wait)
          break
        }

        case 'groom_scratch':
          setAnim(safe('scratch_wall'))
          setPhase('groom_wash')
          timerId = setTimeout(tick, SCRATCH_MS)
          break

        case 'groom_wash':
          setAnim(safe('wash'))
          setPhase('resting')
          nextYawnAt = elapsed + yawnIntervalMs()
          timerId = setTimeout(tick, WASH_MS)
          break

        case 'falling_asleep':
          setAnim(safe('falling_asleep', 'sleep'))
          setPhase('sleeping')
          timerId = setTimeout(tick, FALLING_ASLEEP_MS)
          break

        case 'sleeping':
          setAnim(safe('sleep'))
          break
      }
    }

    activeRef.current = true
    nearStart = Date.now()
    tick()

    return () => {
      activeRef.current = false
      cancel()
      // Clear sequencer animation on exit so it doesn't bleed into the
      // next state's render before the wake flash (or walk) takes over.
      setAnim(null)
    }
  }, [petState])

  // ── Wake-up flash when leaving a real rest (SLEEPING, or post-wash) ───────
  useEffect(() => {
    const prev = prevState.current
    prevState.current = petState

    const leavingRest =
      (prev === 'NEAR_CURSOR' || prev === 'SLEEPING') &&
      (petState === 'WALKING' || petState === 'IDLE')

    if (!leavingRest) return

    // Suppress flash on brief NEAR_CURSOR bounces during approach — only
    // emit 'awaken' when the pet had reached at least the yawning phase or
    // was truly sleeping.
    const wasDeeplyResting = prev === 'SLEEPING' || WAKE_REQUIRED_PHASES.has(lastPhaseRef.current)

    if (!wasDeeplyResting) return
    if (!availRef.current.includes('awaken')) return

    setWakeAnim('awaken')
    if (wakeTimer.current) clearTimeout(wakeTimer.current)
    wakeTimer.current = setTimeout(() => setWakeAnim(null), AWAKE_MS)

    return () => {
      if (wakeTimer.current) clearTimeout(wakeTimer.current)
    }
  }, [petState])

  // ── Combine: idle sequence > wake flash > nothing ─────────────────────────
  if (petState === 'NEAR_CURSOR') return anim
  if (wakeAnim) return wakeAnim
  return null
}
