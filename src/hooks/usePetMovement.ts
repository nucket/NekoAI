import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

// ─── Public types ─────────────────────────────────────────────────────────────

export type PetState = "IDLE" | "WALKING" | "NEAR_CURSOR" | "SLEEPING";

export interface UsePetMovementOptions {
  /**
   * Movement speed in physical pixels per 60 fps frame.
   * At 60 fps: 3 px/frame = 180 px/s — crosses a 1920 px screen in ~10 s.
   * @default 3
   */
  speed?: number;
  /**
   * Distance in physical pixels at which the pet stops chasing and plays "happy".
   * @default 50
   */
  nearThreshold?: number;
  /**
   * Milliseconds of cursor inactivity before the pet falls asleep.
   * @default 300_000 (5 minutes)
   */
  sleepTimeout?: number;
  /**
   * Physical pixel size (width = height) of the app window.
   * Used to compute the window's centre on screen.
   * @default 128
   */
  windowSize?: number;
  /**
   * Set to false to freeze all movement (e.g. while the user is dragging).
   * @default true
   */
  enabled?: boolean;
}

export interface UsePetMovementResult {
  petState: PetState;
  currentAnimation: string;
}

// ─── Internal constants ───────────────────────────────────────────────────────

/** Interval (ms) at which to poll the OS cursor position via Tauri IPC */
const CURSOR_POLL_MS = 50; // 20 Hz

/**
 * Interval (ms) at which to re-read the window's physical position from the OS.
 * This re-syncs after the user manually drags the window.
 */
const POS_RESYNC_MS = 500;

/** Minimum cursor displacement (px) that resets the sleep countdown */
const CURSOR_MOVE_PX = 4;

/**
 * When leaving NEAR_CURSOR the cursor must be this many times farther than
 * nearThreshold before we start chasing again.  Prevents rapid state flipping.
 */
const NEAR_LEAVE_FACTOR = 1.5;

// Default animation per state; WALKING is overridden with walk_left/walk_right
const STATE_ANIM: Record<PetState, string> = {
  IDLE:        "idle",
  WALKING:     "walk_right",
  NEAR_CURSOR: "happy",
  SLEEPING:    "sleep",
};

// ─── Vec2 helper ──────────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number }

function distance(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePetMovement({
  speed         = 3,
  nearThreshold = 50,
  sleepTimeout  = 5 * 60 * 1000,
  windowSize    = 128,
  enabled       = true,
}: UsePetMovementOptions = {}): UsePetMovementResult {

  // React state — updated only on state-machine transitions (minimise re-renders)
  const [petState,         setPetState]         = useState<PetState>("IDLE");
  const [currentAnimation, setCurrentAnimation] = useState("idle");

  // ── Mutable refs (safe to read in rAF closure without going stale) ─────────
  const stateRef          = useRef<PetState>("IDLE");
  const cursorRef         = useRef<Vec2>({ x: 0, y: 0 });
  const prevCursorRef     = useRef<Vec2>({ x: 0, y: 0 });
  const winPosRef         = useRef<Vec2>({ x: 0, y: 0 }); // window top-left, physical px
  const lastCursorMoveRef = useRef(Date.now());
  const animRef           = useRef("idle");                // mirrors currentAnimation
  const rafIdRef          = useRef(0);
  const pollTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const resyncTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const halfSize = windowSize / 2;

  // ── Transition helper ──────────────────────────────────────────────────────
  // Calls setState only when something actually changes.
  const transition = useCallback((next: PetState, dirRight: boolean) => {
    const prev = stateRef.current;

    const nextAnim =
      next === "WALKING"
        ? dirRight ? "walk_right" : "walk_left"
        : STATE_ANIM[next];

    if (prev !== next) {
      stateRef.current = next;
      setPetState(next);
    }

    if (animRef.current !== nextAnim) {
      animRef.current = nextAnim;
      setCurrentAnimation(nextAnim);
    }
  }, []);

  // Direction-only update while already WALKING (no full state transition)
  const setWalkDir = useCallback((dirRight: boolean) => {
    const anim = dirRight ? "walk_right" : "walk_left";
    if (animRef.current !== anim) {
      animRef.current = anim;
      setCurrentAnimation(anim);
    }
  }, []);

  // ── Sync window position from OS ───────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const win = getCurrentWindow();
    const sync = () =>
      win
        .outerPosition()
        .then((p) => { winPosRef.current = { x: p.x, y: p.y }; })
        .catch(() => {});

    sync(); // immediate on mount

    // Re-sync periodically so manual drag repositioning is detected
    resyncTimerRef.current = setInterval(sync, POS_RESYNC_MS);
    return () => {
      if (resyncTimerRef.current) clearInterval(resyncTimerRef.current);
    };
  }, [enabled]);

  // ── Poll cursor position via Tauri backend ─────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const poll = async () => {
      try {
        const pos = await invoke<Vec2>("get_cursor_pos");

        const prev = prevCursorRef.current;
        const d    = distance(pos, prev);

        if (d > CURSOR_MOVE_PX) {
          lastCursorMoveRef.current = Date.now();
          prevCursorRef.current     = pos;
        }

        cursorRef.current = pos;
      } catch {
        // Tauri backend unavailable (pure browser preview) — silently skip
      }
    };

    poll(); // first read immediately
    pollTimerRef.current = setInterval(poll, CURSOR_POLL_MS);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [enabled]);

  // ── Main rAF movement loop ─────────────────────────────────────────────────
  // IMPORTANT: this effect is intentionally NOT async.
  // window.setPosition() is fired-and-forgotten so the loop stays at 60 fps.
  useEffect(() => {
    if (!enabled) return;

    const win = getCurrentWindow();

    const loop = () => {
      const cursor  = cursorRef.current;
      const winPos  = winPosRef.current;
      const state   = stateRef.current;
      const now     = Date.now();

      // Window centre in screen physical coordinates
      const centre: Vec2 = { x: winPos.x + halfSize, y: winPos.y + halfSize };
      const dist         = distance(cursor, centre);
      const dirRight     = cursor.x >= centre.x;
      const idleMs       = now - lastCursorMoveRef.current;

      // ── State machine ────────────────────────────────────────────────────

      switch (state) {

        case "SLEEPING":
          // Wake only when cursor drifts far enough
          if (dist > nearThreshold * NEAR_LEAVE_FACTOR) {
            transition("IDLE", dirRight);
            lastCursorMoveRef.current = now;
          }
          break; // sleeping pet doesn't move

        case "NEAR_CURSOR":
          if (idleMs >= sleepTimeout) {
            // Fell asleep after long inactivity
            transition("SLEEPING", dirRight);
          } else if (dist > nearThreshold * NEAR_LEAVE_FACTOR) {
            // Cursor escaped hysteresis band → start chasing
            transition("WALKING", dirRight);
          }
          break; // pet is still, no position update

        case "IDLE":
          if (idleMs >= sleepTimeout) {
            transition("SLEEPING", dirRight);
          } else if (dist > nearThreshold) {
            transition("WALKING", dirRight);
          }
          break;

        case "WALKING": {
          if (dist <= nearThreshold) {
            transition("NEAR_CURSOR", dirRight);
            break;
          }

          // Update walk direction without a full state transition
          setWalkDir(dirRight);

          // ── Move toward cursor ─────────────────────────────────────────
          // Clamp step size so we never overshoot the target
          const step = Math.min(speed, dist);
          const nx   = (cursor.x - centre.x) / dist;
          const ny   = (cursor.y - centre.y) / dist;
          const newX = winPos.x + nx * step;
          const newY = winPos.y + ny * step;

          // Update our own ref immediately (no IPC round-trip needed)
          winPosRef.current = { x: newX, y: newY };

          // Tell Tauri to move the OS window — fire-and-forget, never await
          win
            .setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)))
            .catch(() => {});
          break;
        }
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [enabled, speed, nearThreshold, sleepTimeout, halfSize, transition, setWalkDir]);

  return { petState, currentAnimation };
}
