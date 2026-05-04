import { useState, useEffect, useRef, useCallback } from 'react'
import type { AppCategory, DesktopContextResult } from '../hooks/useDesktopContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PetBrainResult {
  /** Animation name that overrides normal movement-based animation, or null. */
  overrideAnimation: string | null
  /** Message the pet wants to say, or null. Cleared by calling clearMessage(). */
  pendingMessage: string | null
  clearMessage: () => void
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const CODING_ALERT_MS = 90 * 60 * 1000 // 90 minutes in coding → say something
const IDLE_SLEEP_MS = 10 * 60 * 1000 // 10 minutes idle → sleep
const MUSIC_HAPPY_MS = 5_000 // happy animation duration on music open

const CODING_MESSAGES = [
  'Nyaa~ llevas 90 minutos programando… ¿no deberías estirar las patitas? 🐾',
  '*ronroneo* ¡Llevas mucho tiempo con el código! Recuerda hidratarte 💧',
  'Meow! Tu gato virtual te recuerda: ¡descansa un poco! 🧘',
  '¡Eres una máquina! Pero hasta las máquinas necesitan pausa ☕',
]

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePetBrain({ appCategory, idleMinutes }: DesktopContextResult): PetBrainResult {
  const [overrideAnimation, setOverrideAnimation] = useState<string | null>(null)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)

  const codingStartRef = useRef<number | null>(null)
  const codingAlertedRef = useRef(false)
  const prevCategoryRef = useRef<AppCategory>('other')
  const musicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSleepingRef = useRef(false)

  const clearMessage = useCallback(() => setPendingMessage(null), [])

  useEffect(() => {
    const now = Date.now()
    const idleMs = idleMinutes * 60_000

    // ── Idle sleep ──────────────────────────────────────────────────────────
    if (idleMs >= IDLE_SLEEP_MS) {
      if (!isSleepingRef.current) {
        isSleepingRef.current = true
        setOverrideAnimation('sleep')
      }
      return
    }
    if (isSleepingRef.current) {
      isSleepingRef.current = false
      setOverrideAnimation(null)
    }

    // ── Music app opened → happy ────────────────────────────────────────────
    if (appCategory === 'music' && prevCategoryRef.current !== 'music') {
      if (musicTimerRef.current) clearTimeout(musicTimerRef.current)
      setOverrideAnimation('happy')
      musicTimerRef.current = setTimeout(() => {
        setOverrideAnimation(null)
        musicTimerRef.current = null
      }, MUSIC_HAPPY_MS)
    }

    // ── Coding session tracker ──────────────────────────────────────────────
    if (appCategory === 'coding') {
      if (codingStartRef.current === null) {
        codingStartRef.current = now
        codingAlertedRef.current = false
      } else if (!codingAlertedRef.current && now - codingStartRef.current >= CODING_ALERT_MS) {
        codingAlertedRef.current = true
        const msg = CODING_MESSAGES[Math.floor(Math.random() * CODING_MESSAGES.length)]
        setPendingMessage(msg)
      }
    } else {
      // Reset coding session when user leaves coding apps
      codingStartRef.current = null
      codingAlertedRef.current = false
    }

    prevCategoryRef.current = appCategory
  }, [appCategory, idleMinutes])

  // Cleanup music timer on unmount
  useEffect(() => {
    return () => {
      if (musicTimerRef.current) clearTimeout(musicTimerRef.current)
    }
  }, [])

  return { overrideAnimation, pendingMessage, clearMessage }
}
