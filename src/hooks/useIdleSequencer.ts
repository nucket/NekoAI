import { useEffect, useRef, useState } from 'react'
import type { PetState } from './usePetMovement'

// ─── Timing constants (ms) — faithful to original x11 Neko (125ms/tick) ───

const WASH_MS = 1250 // original: JARE_TIME = 10 ticks × 125ms
const SCRATCH_MS = 500 // original: KAKI_TIME = 4 ticks × 125ms
const YAWN_MS = 375 // original: AKUBI_TIME = 3 ticks × 125ms
const AWAKE_MS = 375 // original: AWAKE_TIME = 3 ticks × 125ms
const FALLING_ASLEEP_MS = 1500 // transition animation duration

const GROOM_AT_MS = 60_000 // 1 min → one-time groom (extended idle only)
const SLEEP_AT_MS = 30000 // ~30s after arriving at cursor before sleeping (original: ~2s, extended for modern pet charm)

/** Random yawn interval while resting: 12–35 seconds (for extended idle) */
function yawnIntervalMs() {
  return 12000 + Math.random() * 23_000
}

// ─── Phase ────────────────────────────────────────────────────────────────────

type Phase =
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
 *   On arrival at cursor (STOP):
 *     wash (JARE, 1.25s) → scratch (KAKI, 0.5s) → yawn (AKUBI, 0.375s) → sleep
 *
 * On departure (cursor moves away):
 *   → 'awaken' flash for ~350ms, then null
 *
 * If the user stays idle near Neko for extended periods (>SLEEP_AT_MS without
 * leaving), Neko cycles: rest → periodic yawn → groom (wash+scratch) → sleep.
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

    // Original sequence: wash → scratch → yawn → sleep
    let phase: Phase = 'wash'
    let nearStart = Date.now()
    let groomed = false
    let nextYawnAt = 0

    function tick() {
      if (!activeRef.current) return

      const elapsed = Date.now() - nearStart

      switch (phase) {
        case 'wash':
          setAnim(safe('wash'))
          phase = 'scratch'
          timerId = setTimeout(tick, WASH_MS)
          break

        case 'scratch':
          setAnim(safe('scratch_wall'))
          phase = 'yawning'
          timerId = setTimeout(tick, SCRATCH_MS)
          break

        case 'yawning':
          setAnim(safe('yawn'))
          phase = 'resting'
          nextYawnAt = elapsed + yawnIntervalMs()
          timerId = setTimeout(tick, YAWN_MS)
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
          setAnim(safe('idle'))
          const wait = Math.max(200, Math.min(nextYawnAt, GROOM_AT_MS, SLEEP_AT_MS) - elapsed)
          timerId = setTimeout(tick, wait)
          break
        }

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
          setAnim(safe('falling_asleep', 'sleep'))
          phase = 'sleeping'
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
      wakeTimer.current = setTimeout(() => setWakeAnim(null), AWAKE_MS)
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
