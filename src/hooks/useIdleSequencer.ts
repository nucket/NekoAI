import { useEffect, useRef, useState } from 'react'
import type { PetState } from './usePetMovement'

// ─── Timing constants (ms) ────────────────────────────────────────────────────

const WASH_MS = 1200
const SCRATCH_MS = 1500
const YAWN_MS = 900
const FALLING_ASLEEP_MS = 1500

const GROOM_AT_MS = 60_000 // 1 min → one-time groom
const SLEEP_AT_MS = 300_000 // 5 min → sleep loop

/** Random yawn interval: 12–35 seconds */
function yawnIntervalMs() {
  return 12000 + Math.random() * 23_000
}

// ─── Phase ────────────────────────────────────────────────────────────────────

type Phase =
  | 'wash'
  | 'scratch'
  | 'resting'
  | 'yawning'
  | 'groom_wash'
  | 'groom_scratch'
  | 'falling_asleep'
  | 'sleeping'

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Drives the nkosrc4 idle animation sequence while petState === 'NEAR_CURSOR',
 * then emits a brief 'awaken' flash when the pet starts moving again.
 *
 * On arrival at cursor:
 *   wash (1.2s) → scratch_wall (0.8s)
 *   → resting: idle by default, yawn every 3–20s
 *   at 60s: one-time groom (wash→scratch→resting)
 *   at 300s: sleep loop
 *
 * On departure (cursor moves away):
 *   → 'awaken' for ~350ms, then null
 */
export function useIdleSequencer(petState: PetState, availableAnimations: string[]): string | null {
  const [anim, setAnim] = useState<string | null>(null)
  const [wakeAnim, setWakeAnim] = useState<string | null>(null)

  const availRef = useRef(availableAnimations)
  const activeRef = useRef(false)
  const prevState = useRef<PetState>(petState)

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

    let phase: Phase = 'scratch'
    let nearStart = Date.now()
    let groomed = false
    let nextYawnAt = 0

    function tick() {
      if (!activeRef.current) return

      const elapsed = Date.now() - nearStart

      switch (phase) {
        case 'scratch':
          setAnim(safe('scratch_wall'))
          phase = 'wash'
          timerId = setTimeout(tick, SCRATCH_MS)
          break

        case 'wash':
          setAnim(safe('wash'))
          phase = 'resting'
          nextYawnAt = elapsed + yawnIntervalMs()
          timerId = setTimeout(tick, WASH_MS)
          break

        case 'resting': {
          if (elapsed >= SLEEP_AT_MS) {
            phase = 'falling_asleep'
            setAnim(safe('falling_asleep', 'sleep'))
            timerId = setTimeout(tick, FALLING_ASLEEP_MS)
            return
          }
          if (!groomed && elapsed >= GROOM_AT_MS) {
            groomed = true
            phase = 'groom_scratch'
            timerId = setTimeout(tick, 0)
            return
          }
          if (elapsed >= nextYawnAt) {
            phase = 'yawning'
            setAnim(safe('yawn'))
            timerId = setTimeout(tick, YAWN_MS)
            return
          }
          // Default: hold on idle, wake up when next event is due
          setAnim(safe('idle'))
          const wait = Math.max(200, Math.min(nextYawnAt, GROOM_AT_MS, SLEEP_AT_MS) - elapsed)
          timerId = setTimeout(tick, wait)
          break
        }

        case 'yawning':
          phase = 'resting'
          nextYawnAt = elapsed + yawnIntervalMs()
          setAnim(safe('idle'))
          timerId = setTimeout(tick, 200)
          break

        case 'groom_scratch':
          setAnim(safe('scratch_wall'))
          phase = 'groom_wash'
          timerId = setTimeout(tick, SCRATCH_MS)
          break

        case 'groom_wash':
          setAnim(safe('wash'))
          phase = 'resting'
          nextYawnAt = elapsed + yawnIntervalMs()
          timerId = setTimeout(tick, WASH_MS)
          break

        case 'falling_asleep':
          phase = 'sleeping'
          setAnim(safe('sleep'))
          break

        case 'sleeping':
          break
      }
    }

    activeRef.current = true
    nearStart = Date.now()
    tick()

    return () => {
      activeRef.current = false
      cancel()
    }
  }, [petState])

  // ── Wake-up flash when leaving NEAR_CURSOR → WALKING ─────────────────────
  useEffect(() => {
    function handleTransition() {
      const prev = prevState.current
      prevState.current = petState

      const leavingRest =
        (prev === 'NEAR_CURSOR' || prev === 'SLEEPING') &&
        (petState === 'WALKING' || petState === 'IDLE')

      if (!leavingRest) return

      const has = (a: string) => availRef.current.includes(a)
      if (!has('awaken')) return

      setWakeAnim('awaken')
      if (wakeTimer.current) clearTimeout(wakeTimer.current)
      wakeTimer.current = setTimeout(() => setWakeAnim(null), 350)
    }

    handleTransition()

    return () => {
      if (wakeTimer.current) clearTimeout(wakeTimer.current)
    }
  }, [petState])

  // ── Combine: idle sequence > wake flash > nothing ─────────────────────────
  if (petState === 'NEAR_CURSOR') return anim
  if (wakeAnim) return wakeAnim
  return null
}
