import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, availableMonitors } from '@tauri-apps/api/window'
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
  availableAnimations?: string[]
  onEdgeHit?: (direction: 'right' | 'left' | 'up' | 'down') => void
}

export interface UsePetMovementResult {
  petState: PetState
  currentAnimation: string
  overridePosition: (x: number, y: number) => void
}

// ─── Internal constants ───────────────────────────────────────────────────────

const CURSOR_POLL_MS = 50
const CURSOR_MOVE_PX = 4
const NEAR_LEAVE_FACTOR = 1.5
const BORED_MS = 60_000 // 1 min idle → bored animation
const CURSOR_IDLE_MS = 250 // cursor must be still this long before Neko stops chasing
const SPEED_PX_PER_SEC = 130 // original Neko: 16px/125ms = 128px/s

const STATE_ANIM: Record<PetState, string> = {
  IDLE: 'idle',
  WALKING: 'walk_right',
  NEAR_CURSOR: 'idle', // overridden by useIdleSequencer; 'idle' avoids loop:false freeze
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

function getWalkAnimation(dx: number, dy: number, availableAnims: string[]): string {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI)
  let idealAnim: string
  let fallbackAnim1 = 'walk_right'
  let fallbackAnim2 = 'walk_right'

  if (angle > -22.5 && angle <= 22.5) {
    idealAnim = 'walk_right'
  } else if (angle > 22.5 && angle <= 67.5) {
    idealAnim = 'walk_down_right'
    fallbackAnim1 = 'walk_right'
    fallbackAnim2 = 'walk_down'
  } else if (angle > 67.5 && angle <= 112.5) {
    idealAnim = 'walk_down'
  } else if (angle > 112.5 && angle <= 157.5) {
    idealAnim = 'walk_down_left'
    fallbackAnim1 = 'walk_left'
    fallbackAnim2 = 'walk_down'
  } else if (angle > 157.5 || angle <= -157.5) {
    idealAnim = 'walk_left'
  } else if (angle > -157.5 && angle <= -112.5) {
    idealAnim = 'walk_up_left'
    fallbackAnim1 = 'walk_left'
    fallbackAnim2 = 'walk_up'
  } else if (angle > -112.5 && angle <= -67.5) {
    idealAnim = 'walk_up'
  } else {
    idealAnim = 'walk_up_right'
    fallbackAnim1 = 'walk_right'
    fallbackAnim2 = 'walk_up'
  }

  if (availableAnims.includes(idealAnim)) return idealAnim
  if (availableAnims.includes(fallbackAnim1)) return fallbackAnim1
  if (availableAnims.includes(fallbackAnim2)) return fallbackAnim2
  if (availableAnims.includes('walk')) return 'walk'
  return idealAnim
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePetMovement({
  speed = 3,
  nearThreshold = 50,
  sleepTimeout = 3 * 60 * 1000,
  windowSize = 128,
  enabled = true,
  mode = 'work',
  availableAnimations = [],
  onEdgeHit,
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

  // Smooth movement accumulator (tracks fractional pixels to avoid losing small steps)
  const moveAccumX = useRef(0)
  const moveAccumY = useRef(0)

  // Keep a ref to availableAnimations so RAF/callbacks always see fresh list
  const availableAnimsRef = useRef(availableAnimations)
  useEffect(() => {
    availableAnimsRef.current = availableAnimations
  }, [availableAnimations])

  // Track previous position for edge direction calculation
  const prevPosRef = useRef<Vec2>({ x: 0, y: 0 })

  // Play-mode wander state
  const wanderTargetRef = useRef<Vec2 | null>(null)
  const wanderWaitUntil = useRef(0)

  const halfSize = windowSize / 2

  // ── Monitor bounds for multi-monitor edge detection ─────────────────────
  interface MonitorBounds {
    x: number
    y: number
    width: number
    height: number
  }
  const monitorBoundsRef = useRef<MonitorBounds[]>([])
  const prevMonitorIndexRef = useRef<number>(-1)
  const edgeCooldownRef = useRef(0)
  const EDGE_COOLDOWN_MS = 800

  useEffect(() => {
    if (!enabled) return
    async function loadMonitors() {
      try {
        const all = await availableMonitors()
        if (all.length > 0) {
          monitorBoundsRef.current = all.map((m) => ({
            x: m.position.x,
            y: m.position.y,
            width: m.size.width,
            height: m.size.height,
          }))
        }
      } catch {
        monitorBoundsRef.current = []
      }
    }
    loadMonitors()
  }, [enabled])

  // ── Helper: find which monitor the pet center is on ─────────────────────
  const findMonitorIndex = useCallback((cx: number, cy: number): number => {
    const bounds = monitorBoundsRef.current
    for (let i = 0; i < bounds.length; i++) {
      const m = bounds[i]
      if (cx >= m.x && cx < m.x + m.width && cy >= m.y && cy < m.y + m.height) {
        return i
      }
    }
    return -1
  }, [])

  // ── Transition helper ──────────────────────────────────────────────────────
  const transition = useCallback((next: PetState, dx: number, dy: number) => {
    const prev = stateRef.current
    const nextAnim =
      next === 'WALKING' ? getWalkAnimation(dx, dy, availableAnimsRef.current) : STATE_ANIM[next]

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
    const anim = getWalkAnimation(dx, dy, availableAnimsRef.current)
    if (animRef.current !== anim) {
      animRef.current = anim
      setCurrentAnimation(anim)
    }
  }, [])

  // ── Animation helper for idle-phase overrides (bored) ─────────────────────
  const setIdleAnim = useCallback((anim: string) => {
    if (animRef.current !== anim) {
      animRef.current = anim
      setCurrentAnimation(anim)
    }
  }, [])

  // ── Sync window position from OS ───────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    getCurrentWindow()
      .outerPosition()
      .then((p) => {
        winPosRef.current = { x: p.x, y: p.y }
      })
      .catch(() => {})
  }, [enabled])

  // ── Re-sync on window show ─────────────────────────────────────────────────
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
        // Use the same 4px threshold for both activity detection and prevCursor
        // update. Without this, a stationary cursor sitting 1–3px from prevCursor
        // (within the jitter band) keeps resetting lastCursorMoveRef every poll,
        // so isCursorStopped is never true and NEAR_CURSOR is never reached.
        if (d >= CURSOR_MOVE_PX) {
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
      if (document.hidden) return

      const cursor = cursorRef.current
      const winPos = winPosRef.current
      const state = stateRef.current
      const now = Date.now()

      const centre: Vec2 = { x: winPos.x + halfSize, y: winPos.y + halfSize }
      const dist = distance(cursor, centre)
      const dx = cursor.x - centre.x
      const dy = cursor.y - centre.y
      const idleMs = now - lastCursorMoveRef.current

      // ── State machine ──────────────────────────────────────────────────────

      if (mode === 'play') {
        // ── Play Mode ─────────────────────────────────────────────────────────

        if (dist <= nearThreshold && state !== 'NEAR_CURSOR' && state !== 'SLEEPING') {
          transition('NEAR_CURSOR', dx, dy)
          wanderWaitUntil.current = now + 1500
        }

        switch (state) {
          case 'SLEEPING':
            if (idleMs < sleepTimeout) {
              transition('IDLE', 0, 1)
              lastCursorMoveRef.current = now
            }
            break

          case 'NEAR_CURSOR':
            if (dist > nearThreshold * NEAR_LEAVE_FACTOR && now >= wanderWaitUntil.current) {
              transition('IDLE', 0, 1)
            }
            break

          case 'IDLE': {
            // Bored animation while resting between wander targets
            if (idleMs >= BORED_MS) {
              const boredAnim = availableAnimsRef.current.includes('bored') ? 'bored' : 'idle'
              setIdleAnim(boredAnim)
            } else if (animRef.current === 'bored') {
              setIdleAnim('idle')
            }

            if (now >= wanderWaitUntil.current) {
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
              wanderTargetRef.current = null
              wanderWaitUntil.current = now + 2000 + Math.random() * 3000
              transition('IDLE', 0, 1)
              lastCursorMoveRef.current = now
              moveAccumX.current = 0
              moveAccumY.current = 0
              break
            }

            setWalkDir(wtDx, wtDy)

            // Frame-based movement with accumulator for smooth motion
            const frameStep = SPEED_PX_PER_SEC / 60 // ~16.67ms frame
            moveAccumX.current += (wtDx / wtDist) * frameStep
            moveAccumY.current += (wtDy / wtDist) * frameStep

            const intStepX = Math.trunc(moveAccumX.current)
            const intStepY = Math.trunc(moveAccumY.current)

            if (intStepX !== 0 || intStepY !== 0) {
              moveAccumX.current -= intStepX
              moveAccumY.current -= intStepY

              const newX = winPos.x + intStepX
              const newY = winPos.y + intStepY

              winPosRef.current = { x: newX, y: newY }
              win
                .setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)))
                .catch(() => {})
            }
            break
          }
        }
      } else {
        // ── Work Mode: pet follows cursor ─────────────────────────────────────

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
            } else if (idleMs >= BORED_MS) {
              // 1 min cursor idle → bored animation (still IDLE state)
              const boredAnim = availableAnimsRef.current.includes('bored') ? 'bored' : 'idle'
              setIdleAnim(boredAnim)
            } else if (animRef.current === 'bored') {
              // Cursor moved within near zone: revert from bored to idle
              setIdleAnim('idle')
            }
            break

          case 'WALKING': {
            // Only stop chasing when cursor is near AND has been idle (stopped moving)
            const cursorIdleMs = now - lastCursorMoveRef.current
            const isCursorStopped = cursorIdleMs >= CURSOR_IDLE_MS

            if (dist <= nearThreshold && isCursorStopped) {
              transition('NEAR_CURSOR', dx, dy)
              moveAccumX.current = 0
              moveAccumY.current = 0
              break
            }

            // Keep walking towards cursor (even if within threshold, if cursor is still moving)
            // Avoid micro-jittering when very close: require minimum step distance
            if (dist < 5) {
              break
            }

            const walkDx = dx
            const walkDy = dy
            const walkDist = dist

            setWalkDir(walkDx, walkDy)

            // Frame-based movement with accumulator for smooth motion
            const frameStep = SPEED_PX_PER_SEC / 60 // ~16.67ms frame
            moveAccumX.current += (walkDx / walkDist) * frameStep
            moveAccumY.current += (walkDy / walkDist) * frameStep

            const intStepX = Math.trunc(moveAccumX.current)
            const intStepY = Math.trunc(moveAccumY.current)

            if (intStepX !== 0 || intStepY !== 0) {
              moveAccumX.current -= intStepX
              moveAccumY.current -= intStepY

              const newX = winPos.x + intStepX
              const newY = winPos.y + intStepY

              winPosRef.current = { x: newX, y: newY }
              win
                .setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)))
                .catch(() => {})
            }
            break
          }
        }
      }

      // ── Edge hit detection (cross-monitor boundary) ──────────────────────
      if (state === 'WALKING' && onEdgeHit && monitorBoundsRef.current.length > 0) {
        const now2 = Date.now()
        if (now2 >= edgeCooldownRef.current) {
          const prevMonIdx = prevMonitorIndexRef.current
          const currMonIdx = findMonitorIndex(centre.x, centre.y)

          if (prevMonIdx !== -1 && currMonIdx !== prevMonIdx) {
            // Determine crossing direction from movement delta
            const ddX = centre.x - prevPosRef.current.x
            const ddY = centre.y - prevPosRef.current.y
            let edgeDir: 'right' | 'left' | 'up' | 'down'
            if (Math.abs(ddX) > Math.abs(ddY)) {
              edgeDir = ddX > 0 ? 'right' : 'left'
            } else {
              edgeDir = ddY > 0 ? 'down' : 'up'
            }
            onEdgeHit(edgeDir)
            edgeCooldownRef.current = now2 + EDGE_COOLDOWN_MS
          }
          prevMonitorIndexRef.current = currMonIdx
        }
      }

      // Track position for next frame's edge direction calculation
      prevPosRef.current = { x: centre.x, y: centre.y }
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
    setIdleAnim,
    onEdgeHit,
    findMonitorIndex,
  ])

  // ─── External override ─────────────────────────────────────────────────────
  const overridePosition = useCallback((x: number, y: number) => {
    winPosRef.current = { x, y }
    getCurrentWindow()
      .setPosition(new PhysicalPosition(x, y))
      .catch(() => {})
  }, [])

  return { petState, currentAnimation, overridePosition }
}
