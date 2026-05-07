import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { AppCategory } from './useDesktopContext'
import type { PetState } from './usePetMovement'

// ─── Mood computation ─────────────────────────────────────────────────────────

function computeEnergy(hour: number, idleMinutes: number): number {
  // Sinusoidal day cycle: peak at 11am (~95), trough at 3am (~10)
  const offset = ((hour - 3 + 24) % 24) / 24 // 0 at 3am, 0.5 at 3pm
  const timeBase = 10 + 80 * Math.sin(offset * Math.PI)

  // OS idle penalty: -4 per minute idle, capped at -50
  const penalty = Math.min(50, idleMinutes * 4)

  return Math.round(Math.max(5, Math.min(100, timeBase - penalty)))
}

function computeHappiness(hour: number): number {
  return hour >= 7 && hour < 22 ? 70 : 45
}

function computeCuriosity(appCategory: AppCategory): number {
  switch (appCategory) {
    case 'coding':
      return 75
    case 'browsing':
      return 60
    case 'communication':
      return 55
    case 'music':
      return 50
    default:
      return 40
  }
}

// ─── Yawn trigger constants ───────────────────────────────────────────────────

// Yawn animation: 2 frames at 3 fps ≈ 667 ms
const YAWN_DURATION_MS = 750
// Minimum gap between yawns
const YAWN_COOLDOWN_MS = 2 * 60_000
// OS idle window that triggers a yawn (1–2 min) — aligns with bored phase
const YAWN_IDLE_MIN = 1
const YAWN_IDLE_MAX = 2

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseMoodEngineOptions {
  idleMinutes: number
  appCategory: AppCategory
  petState: PetState
}

export function useMoodEngine({ idleMinutes, appCategory, petState }: UseMoodEngineOptions): {
  moodOverride: string | null
} {
  const setMood = useAppStore((s) => s.setMood)
  const [moodOverride, setMoodOverride] = useState<string | null>(null)

  const lastYawnRef = useRef(0)
  const petStateRef = useRef(petState)
  const idleMinutesRef = useRef(idleMinutes)
  const appCategoryRef = useRef(appCategory)
  const yawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastWalkingTimeRef = useRef(0) // tracks last WALKING state to prevent yawn during movement

  useEffect(() => {
    petStateRef.current = petState
    if (petState === 'WALKING') {
      lastWalkingTimeRef.current = Date.now()
    }
  }, [petState])
  useEffect(() => {
    idleMinutesRef.current = idleMinutes
  }, [idleMinutes])
  useEffect(() => {
    appCategoryRef.current = appCategory
  }, [appCategory])

  // ── Periodic mood update (60s) ──────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      const hour = new Date().getHours()
      const idle = idleMinutesRef.current
      const cat = appCategoryRef.current

      setMood({
        energy: computeEnergy(hour, idle),
        happiness: computeHappiness(hour),
        curiosity: computeCuriosity(cat),
      })

      // Yawn trigger: OS idle in 1–2 min window, pet must be still (not moving)
      // and must NOT be currently NEAR_CURSOR — the idle sequencer owns that
      // state and emits its own yawn at the right moment, so a parallel
      // moodOverride yawn would race it. We also wait 5s after the last
      // WALKING transition so a yawn never pre-empts a fresh walk_*.
      if (
        petStateRef.current === 'IDLE' &&
        idle >= YAWN_IDLE_MIN &&
        idle < YAWN_IDLE_MAX &&
        Date.now() - lastWalkingTimeRef.current >= 5000
      ) {
        const now = Date.now()
        if (now - lastYawnRef.current >= YAWN_COOLDOWN_MS) {
          lastYawnRef.current = now
          setMoodOverride('yawn')

          if (yawnTimerRef.current) clearTimeout(yawnTimerRef.current)
          yawnTimerRef.current = setTimeout(() => setMoodOverride(null), YAWN_DURATION_MS)
        }
      }
    }

    update()
    const id = setInterval(update, 60_000)
    return () => {
      clearInterval(id)
      if (yawnTimerRef.current) clearTimeout(yawnTimerRef.current)
    }
  }, [setMood])

  return { moodOverride }
}
