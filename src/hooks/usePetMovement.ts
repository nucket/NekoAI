import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, availableMonitors } from '@tauri-apps/api/window'
import { PhysicalPosition } from '@tauri-apps/api/dpi'

// ─── Public types ─────────────────────────────────────────────────────────────

export type PetState = 'IDLE' | 'WALKING' | 'NEAR_CURSOR' | 'SLEEPING'

export type EdgeDirection = 'right' | 'left' | 'up' | 'down'
export type EdgeAnimationKind = 'scratch' | 'yawn' | 'idle'

export interface UsePetMovementOptions {
  speed?: number
  nearThreshold?: number
  sleepTimeout?: number
  windowSize?: number
  enabled?: boolean
  mode?: 'buddy' | 'wanderer'
  availableAnimations?: string[]
  /** Called by the edge state machine when an animation override should play
   *  for `durationMs` while the pet is frozen at a monitor boundary. */
  onEdgeAnimation?: (kind: EdgeAnimationKind, direction: EdgeDirection, durationMs: number) => void
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
const NEAR_ENTER_FACTOR = 0.7 // pet must be visibly close (not just within "near" zone) to stop and groom
const BORED_MS = 60_000 // 1 min idle → bored animation
const CURSOR_IDLE_MS = 400 // cursor must be still this long before Neko stops chasing — bumped from 250ms so brief mouse pauses during approach don't trigger a fake NEAR_CURSOR
const SPEED_PX_PER_SEC = 130 // original Neko: 16px/125ms = 128px/s
// Edge-sequence timings — classic Neko-style "stuck at the wall" behaviour.
// Sequence: scratch1 → maybe(yawn → rest) → scratch2 → cross. At each phase
// the sprite is frozen fully inside the current monitor (bounding-box clamp),
// so the pet never appears split across screens.
const EDGE_SCRATCH_MS = 1500
const EDGE_YAWN_MS = 750
const EDGE_REST_MIN_MS = 1500
const EDGE_REST_MAX_MS = 3000
const EDGE_YAWN_PROBABILITY = 0.5 // 50% chance the yawn+rest sequence runs between the two scratches
const EDGE_CROSS_GRACE_MS = 600 // grace after sequence ends so the pet can step through the boundary before edge can re-trigger

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
  mode = 'buddy',
  availableAnimations = [],
  onEdgeAnimation,
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
  const edgePauseUntilRef = useRef(0)

  // Edge state machine — drives the classic Neko "stuck at the wall" sequence
  type EdgePhase = 'none' | 'scratch1' | 'yawning' | 'resting' | 'scratch2'
  const edgePhaseRef = useRef<EdgePhase>('none')
  const edgeDirRef = useRef<EdgeDirection>('right')

  // Returns the bounding-box edge that would be crossed by stepping to (projX, projY),
  // or null if the sprite would still fit fully inside `mon`. When more than one edge
  // would be violated (corner case), the larger violation wins so the scratch
  // direction matches what the user perceives as the "wall".
  const getBoundingBoxEdgeHit = useCallback(
    (projX: number, projY: number, size: number, mon: MonitorBounds): EdgeDirection | null => {
      const overRight = projX + size - (mon.x + mon.width)
      const overLeft = mon.x - projX
      const overDown = projY + size - (mon.y + mon.height)
      const overUp = mon.y - projY

      let best: EdgeDirection | null = null
      let bestAmount = 0
      if (overRight > bestAmount) {
        best = 'right'
        bestAmount = overRight
      }
      if (overLeft > bestAmount) {
        best = 'left'
        bestAmount = overLeft
      }
      if (overDown > bestAmount) {
        best = 'down'
        bestAmount = overDown
      }
      if (overUp > bestAmount) {
        best = 'up'
      }
      return best
    },
    []
  )

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

      if (mode === 'wanderer') {
        // ── Wanderer Mode ─────────────────────────────────────────────────────

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
        // ── Buddy Mode: pet follows cursor ────────────────────────────────────

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
            // ── Edge state machine ───────────────────────────────────────
            // While in any non-'none' phase, position is frozen (state stays
            // WALKING so resolveAnimation lets edgeAnimOverride win). When the
            // pause for the current phase expires, advance to the next phase.
            // Sequence: scratch1 → maybe(yawn → resting) → scratch2 → 'none' (cross).
            if (edgePhaseRef.current !== 'none') {
              if (now < edgePauseUntilRef.current) break

              const dir = edgeDirRef.current
              switch (edgePhaseRef.current) {
                case 'scratch1':
                  if (Math.random() < EDGE_YAWN_PROBABILITY) {
                    edgePhaseRef.current = 'yawning'
                    edgePauseUntilRef.current = now + EDGE_YAWN_MS
                    onEdgeAnimation?.('yawn', dir, EDGE_YAWN_MS)
                  } else {
                    edgePhaseRef.current = 'none'
                    edgeCooldownRef.current = now + EDGE_CROSS_GRACE_MS
                  }
                  break
                case 'yawning': {
                  const restMs =
                    EDGE_REST_MIN_MS + Math.random() * (EDGE_REST_MAX_MS - EDGE_REST_MIN_MS)
                  edgePhaseRef.current = 'resting'
                  edgePauseUntilRef.current = now + restMs
                  onEdgeAnimation?.('idle', dir, restMs)
                  break
                }
                case 'resting':
                  edgePhaseRef.current = 'scratch2'
                  edgePauseUntilRef.current = now + EDGE_SCRATCH_MS
                  onEdgeAnimation?.('scratch', dir, EDGE_SCRATCH_MS)
                  break
                case 'scratch2':
                  edgePhaseRef.current = 'none'
                  edgeCooldownRef.current = now + EDGE_CROSS_GRACE_MS
                  break
              }

              if (edgePhaseRef.current !== 'none') break
              // Sequence finished — fall through and let the pet step across this frame.
            }

            // Only stop chasing when cursor is near AND has been idle (stopped moving).
            // Use a stricter inner radius for entry (nearThreshold * 0.7) so the pet
            // is visibly next to the cursor before grooming kicks in. The exit
            // radius stays at nearThreshold * 1.5 — that hysteresis avoids
            // immediate re-walk when the cursor wiggles within the near zone.
            const cursorIdleMs = now - lastCursorMoveRef.current
            const isCursorStopped = cursorIdleMs >= CURSOR_IDLE_MS
            const nearEnterRadius = nearThreshold * NEAR_ENTER_FACTOR

            if (dist <= nearEnterRadius && isCursorStopped) {
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
              // ── Pre-cross edge detection (bounding box) ──────────────────
              // Project the next sprite bounding box. If any edge would leave
              // the current monitor, freeze the pet WITHIN this monitor and
              // start the scratch/yawn sequence. Position is clamped so the
              // sprite stays fully visible on the current screen — the pet
              // never appears split between two monitors.
              if (
                onEdgeAnimation &&
                monitorBoundsRef.current.length > 0 &&
                now >= edgeCooldownRef.current
              ) {
                const currMonIdx = findMonitorIndex(centre.x, centre.y)
                if (currMonIdx !== -1) {
                  const mon = monitorBoundsRef.current[currMonIdx]
                  const projWinX = winPos.x + intStepX
                  const projWinY = winPos.y + intStepY
                  const edgeDir = getBoundingBoxEdgeHit(projWinX, projWinY, windowSize, mon)

                  if (edgeDir !== null) {
                    // Clamp the sprite back to fit fully inside the current
                    // monitor — handles the case where the previous frame
                    // already left it partially poking out.
                    const clampedX = Math.max(
                      mon.x,
                      Math.min(winPos.x, mon.x + mon.width - windowSize)
                    )
                    const clampedY = Math.max(
                      mon.y,
                      Math.min(winPos.y, mon.y + mon.height - windowSize)
                    )
                    if (clampedX !== winPos.x || clampedY !== winPos.y) {
                      winPosRef.current = { x: clampedX, y: clampedY }
                      win
                        .setPosition(
                          new PhysicalPosition(Math.round(clampedX), Math.round(clampedY))
                        )
                        .catch(() => {})
                    }

                    edgePhaseRef.current = 'scratch1'
                    edgeDirRef.current = edgeDir
                    edgePauseUntilRef.current = now + EDGE_SCRATCH_MS
                    onEdgeAnimation('scratch', edgeDir, EDGE_SCRATCH_MS)
                    moveAccumX.current = 0
                    moveAccumY.current = 0
                    prevMonitorIndexRef.current = currMonIdx
                    break // do NOT apply this step
                  }
                  prevMonitorIndexRef.current = currMonIdx
                }
              }

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
    onEdgeAnimation,
    findMonitorIndex,
    getBoundingBoxEdgeHit,
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
