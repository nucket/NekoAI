import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { PhysicalPosition } from '@tauri-apps/api/dpi'

// ─── Public types ─────────────────────────────────────────────────────────────

export type PetState = 'IDLE' | 'WALKING' | 'NEAR_CURSOR' | 'SLEEPING'

export interface UsePetMovementOptions {
  speed?: number
  nearThreshold?: number
  sleepTimeout?: number
  windowSize?: number
  enabled?: boolean
  mode?: 'work' | 'play'
}

export interface UsePetMovementResult {
  petState: PetState
  currentAnimation: string
}

// ─── Internal constants ───────────────────────────────────────────────────────

const CURSOR_POLL_MS = 50
const CURSOR_MOVE_PX = 4
const NEAR_LEAVE_FACTOR = 1.5

const STATE_ANIM: Record<PetState, string> = {
  IDLE: 'idle',
  WALKING: 'walk_right',
  NEAR_CURSOR: 'happy',
  SLEEPING: 'sleep',
}

// ─── Vec2 helper ──────────────────────────────────────────────────────────────

interface Vec2 {
  x: number
  y: number
}

function distance(a: Vec2, b: Vec2) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

// ─── 8-direction walk animation selector ─────────────────────────────────────

function getWalkAnimation(dx: number, dy: number): string {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI)
  if (angle > -22.5 && angle <= 22.5) return 'walk_right'
  if (angle > 22.5 && angle <= 67.5) return 'walk_down_right'
  if (angle > 67.5 && angle <= 112.5) return 'walk_down'
  if (angle > 112.5 && angle <= 157.5) return 'walk_down_left'
  if (angle > 157.5 || angle <= -157.5) return 'walk_left'
  if (angle > -157.5 && angle <= -112.5) return 'walk_up_left'
  if (angle > -112.5 && angle <= -67.5) return 'walk_up'
  return 'walk_up_right'
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePetMovement({
  speed = 3,
  nearThreshold = 50,
  sleepTimeout = 5 * 60 * 1000,
  windowSize = 128,
  enabled = true,
  mode = 'work',
}: UsePetMovementOptions = {}): UsePetMovementResult {
  const [petState, setPetState] = useState<PetState>('IDLE')
  const [currentAnimation, setCurrentAnimation] = useState('idle')

  const stateRef = useRef<PetState>('IDLE')
  const cursorRef = useRef<Vec2>({ x: 0, y: 0 })
  const prevCursorRef = useRef<Vec2>({ x: 0, y: 0 })
  const winPosRef = useRef<Vec2>({ x: 0, y: 0 })
  // eslint-disable-next-line react-hooks/purity
  const lastCursorMoveRef = useRef(Date.now())
  const animRef = useRef('idle')
  const rafIdRef = useRef(0)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Play-mode wander state
  const wanderTargetRef = useRef<Vec2 | null>(null)
  const wanderWaitUntil = useRef(0)

  const halfSize = windowSize / 2

  // ── Transition helper ──────────────────────────────────────────────────────
  // Now receives dx/dy instead of dirRight to support 8 directions
  const transition = useCallback((next: PetState, dx: number, dy: number) => {
    const prev = stateRef.current

    const nextAnim = next === 'WALKING' ? getWalkAnimation(dx, dy) : STATE_ANIM[next]

    if (prev !== next) {
      stateRef.current = next
      setPetState(next)
    }

    if (animRef.current !== nextAnim) {
      animRef.current = nextAnim
      setCurrentAnimation(nextAnim)
    }
  }, [])

  // Direction-only update while already WALKING
  const setWalkDir = useCallback((dx: number, dy: number) => {
    const anim = getWalkAnimation(dx, dy)
    if (animRef.current !== anim) {
      animRef.current = anim
      setCurrentAnimation(anim)
    }
  }, [])

  // ── Sync window position from OS (once on enable, then on visibility change) ──
  useEffect(() => {
    if (!enabled) return
    getCurrentWindow()
      .outerPosition()
      .then((p) => {
        winPosRef.current = { x: p.x, y: p.y }
      })
      .catch(() => {})
  }, [enabled])

  // ── Re-sync on window show (prevents stale position after hide/show) ────────
  useEffect(() => {
    if (!enabled) return
    const win = getCurrentWindow()
    const onVisibility = () => {
      if (!document.hidden) {
        win
          .outerPosition()
          .then((p) => {
            winPosRef.current = { x: p.x, y: p.y }
          })
          .catch(() => {})
        // Reset idle clock so pet doesn't immediately sleep on show
        lastCursorMoveRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled])

  // ── Poll cursor position via Tauri backend ─────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const poll = async () => {
      try {
        const pos = await invoke<Vec2>('get_cursor_pos')
        const prev = prevCursorRef.current
        const d = distance(pos, prev)
        if (d > CURSOR_MOVE_PX) {
          lastCursorMoveRef.current = Date.now()
          prevCursorRef.current = pos
        }
        cursorRef.current = pos
      } catch {
        // Tauri backend unavailable — silently skip
      }
    }

    poll()
    pollTimerRef.current = setInterval(poll, CURSOR_POLL_MS)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [enabled])

  // ── Main rAF movement loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const win = getCurrentWindow()

    const loop = () => {
      rafIdRef.current = requestAnimationFrame(loop)
      // Skip movement updates while window is hidden (WebView2 throttles rAF
      // when hidden, so winPosRef drifts; we resume only when fully visible)
      if (document.hidden) return

      const cursor = cursorRef.current
      const winPos = winPosRef.current
      const state = stateRef.current
      const now = Date.now()

      const centre: Vec2 = { x: winPos.x + halfSize, y: winPos.y + halfSize }
      const dist = distance(cursor, centre)

      // Displacement vector from pet centre to cursor (used for 8-dir selection)
      const dx = cursor.x - centre.x
      const dy = cursor.y - centre.y

      const idleMs = now - lastCursorMoveRef.current

      // ── State machine ────────────────────────────────────────────────────

      if (mode === 'play') {
        // ── Play Mode: pet wanders to random screen positions autonomously ──

        // If cursor gets very close, react briefly
        if (dist <= nearThreshold && state !== 'NEAR_CURSOR' && state !== 'SLEEPING') {
          transition('NEAR_CURSOR', dx, dy)
          wanderWaitUntil.current = now + 1500
        }

        switch (state) {
          case 'SLEEPING':
            // In play mode sleep is never entered via idleMs;
            // wake up if the cursor moves (user comes back)
            if (idleMs < sleepTimeout) {
              transition('IDLE', 0, 1)
              lastCursorMoveRef.current = now
            }
            break

          case 'NEAR_CURSOR':
            // Brief reaction to cursor proximity, then resume wandering
            if (dist > nearThreshold * NEAR_LEAVE_FACTOR && now >= wanderWaitUntil.current) {
              transition('IDLE', 0, 1)
            }
            break

          case 'IDLE': {
            if (now >= wanderWaitUntil.current) {
              // Pick a new random screen target (physical coords)
              const scale = window.devicePixelRatio || 1
              const screenW = window.screen.availWidth * scale
              const screenH = window.screen.availHeight * scale
              const margin = windowSize * scale
              wanderTargetRef.current = {
                x: margin + Math.random() * (screenW - margin * 2),
                y: margin + Math.random() * (screenH - margin * 2),
              }
              transition('WALKING', 1, 0)
            }
            break
          }

          case 'WALKING': {
            const wt = wanderTargetRef.current
            if (!wt) {
              transition('IDLE', 0, 1)
              break
            }

            const wtDx = wt.x - centre.x
            const wtDy = wt.y - centre.y
            const wtDist = distance(wt, centre)

            if (wtDist <= nearThreshold) {
              // Reached target — rest for 2–5 s then pick next
              wanderTargetRef.current = null
              wanderWaitUntil.current = now + 2000 + Math.random() * 3000
              transition('IDLE', 0, 1)
              // Pet moved, reset idle clock so it never sleeps mid-play
              lastCursorMoveRef.current = now
              break
            }

            setWalkDir(wtDx, wtDy)

            const step = Math.min(speed, wtDist)
            const nx = wtDx / wtDist
            const ny = wtDy / wtDist
            const newX = winPos.x + nx * step
            const newY = winPos.y + ny * step

            winPosRef.current = { x: newX, y: newY }
            win
              .setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)))
              .catch(() => {})
            break
          }
        }
      } else {
        // ── Work Mode: pet follows cursor (original behaviour) ──────────────

        switch (state) {
          case 'SLEEPING':
            if (dist > nearThreshold * NEAR_LEAVE_FACTOR) {
              transition('IDLE', dx, dy)
              lastCursorMoveRef.current = now
            }
            break

          case 'NEAR_CURSOR':
            if (idleMs >= sleepTimeout) {
              transition('SLEEPING', dx, dy)
            } else if (dist > nearThreshold * NEAR_LEAVE_FACTOR) {
              transition('WALKING', dx, dy)
            }
            break

          case 'IDLE':
            if (idleMs >= sleepTimeout) {
              transition('SLEEPING', dx, dy)
            } else if (dist > nearThreshold) {
              transition('WALKING', dx, dy)
            }
            break

          case 'WALKING': {
            if (dist <= nearThreshold) {
              transition('NEAR_CURSOR', dx, dy)
              break
            }

            setWalkDir(dx, dy)

            const step = Math.min(speed, dist)
            const nx = dx / dist
            const ny = dy / dist
            const newX = winPos.x + nx * step
            const newY = winPos.y + ny * step

            winPosRef.current = { x: newX, y: newY }
            win
              .setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)))
              .catch(() => {})
            break
          }
        }
      }
    }

    rafIdRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafIdRef.current)
  }, [
    enabled,
    speed,
    nearThreshold,
    sleepTimeout,
    windowSize,
    halfSize,
    mode,
    transition,
    setWalkDir,
  ])

  return { petState, currentAnimation }
}
