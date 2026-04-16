import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

// ─── Public types ─────────────────────────────────────────────────────────────

export type PetState = "IDLE" | "WALKING" | "NEAR_CURSOR" | "SLEEPING";

export interface UsePetMovementOptions {
  speed?: number;
  nearThreshold?: number;
  sleepTimeout?: number;
  windowSize?: number;
  enabled?: boolean;
  /** Keep animations running but freeze the OS window position */
  windowLocked?: boolean;
}

export interface UsePetMovementResult {
  petState: PetState;
  currentAnimation: string;
}

// ─── Internal constants ───────────────────────────────────────────────────────

const CURSOR_POLL_MS = 50;
const POS_RESYNC_MS = 500;
const CURSOR_MOVE_PX = 4;
const NEAR_LEAVE_FACTOR = 1.5;

const STATE_ANIM: Record<PetState, string> = {
  IDLE: "idle",
  WALKING: "walk_right",
  NEAR_CURSOR: "happy",
  SLEEPING: "sleep",
};

// ─── Vec2 helper ──────────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number }

function distance(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── 8-direction walk animation selector ─────────────────────────────────────

function getWalkAnimation(dx: number, dy: number): string {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle > -22.5 && angle <= 22.5) return "walk_right";
  if (angle > 22.5 && angle <= 67.5) return "walk_down_right";
  if (angle > 67.5 && angle <= 112.5) return "walk_down";
  if (angle > 112.5 && angle <= 157.5) return "walk_down_left";
  if (angle > 157.5 || angle <= -157.5) return "walk_left";
  if (angle > -157.5 && angle <= -112.5) return "walk_up_left";
  if (angle > -112.5 && angle <= -67.5) return "walk_up";
  return "walk_up_right";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePetMovement({
  speed = 3,
  nearThreshold = 50,
  sleepTimeout = 5 * 60 * 1000,
  windowSize = 128,
  enabled = true,
  windowLocked = false,
}: UsePetMovementOptions = {}): UsePetMovementResult {

  const [petState, setPetState] = useState<PetState>("IDLE");
  const [currentAnimation, setCurrentAnimation] = useState("idle");

  const stateRef = useRef<PetState>("IDLE");
  const cursorRef = useRef<Vec2>({ x: 0, y: 0 });
  const prevCursorRef = useRef<Vec2>({ x: 0, y: 0 });
  const winPosRef = useRef<Vec2>({ x: 0, y: 0 });
  const lastCursorMoveRef = useRef(Date.now());
  const animRef = useRef("idle");
  const rafIdRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const halfSize = windowSize / 2;

  // ── Transition helper ──────────────────────────────────────────────────────
  // Now receives dx/dy instead of dirRight to support 8 directions
  const transition = useCallback((next: PetState, dx: number, dy: number) => {
    const prev = stateRef.current;

    const nextAnim =
      next === "WALKING"
        ? getWalkAnimation(dx, dy)
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

  // Direction-only update while already WALKING
  const setWalkDir = useCallback((dx: number, dy: number) => {
    const anim = getWalkAnimation(dx, dy);
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
        .catch(() => { });

    sync();
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
        const d = distance(pos, prev);
        if (d > CURSOR_MOVE_PX) {
          lastCursorMoveRef.current = Date.now();
          prevCursorRef.current = pos;
        }
        cursorRef.current = pos;
      } catch {
        // Tauri backend unavailable — silently skip
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, CURSOR_POLL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [enabled]);

  // ── Main rAF movement loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const win = getCurrentWindow();

    const loop = () => {
      const cursor = cursorRef.current;
      const winPos = winPosRef.current;
      const state = stateRef.current;
      const now = Date.now();

      const centre: Vec2 = { x: winPos.x + halfSize, y: winPos.y + halfSize };
      const dist = distance(cursor, centre);

      // Displacement vector from pet centre to cursor (used for 8-dir selection)
      const dx = cursor.x - centre.x;
      const dy = cursor.y - centre.y;

      const idleMs = now - lastCursorMoveRef.current;

      // ── State machine ────────────────────────────────────────────────────

      switch (state) {

        case "SLEEPING":
          if (dist > nearThreshold * NEAR_LEAVE_FACTOR) {
            transition("IDLE", dx, dy);
            lastCursorMoveRef.current = now;
          }
          break;

        case "NEAR_CURSOR":
          if (idleMs >= sleepTimeout) {
            transition("SLEEPING", dx, dy);
          } else if (dist > nearThreshold * NEAR_LEAVE_FACTOR) {
            transition("WALKING", dx, dy);
          }
          break;

        case "IDLE":
          if (idleMs >= sleepTimeout) {
            transition("SLEEPING", dx, dy);
          } else if (dist > nearThreshold) {
            transition("WALKING", dx, dy);
          }
          break;

        case "WALKING": {
          if (dist <= nearThreshold) {
            transition("NEAR_CURSOR", dx, dy);
            break;
          }

          // Update walk direction using full dx/dy vector
          setWalkDir(dx, dy);

          const step = Math.min(speed, dist);
          const nx = dx / dist;
          const ny = dy / dist;
          const newX = winPos.x + nx * step;
          const newY = winPos.y + ny * step;

          winPosRef.current = { x: newX, y: newY };
          if (!windowLocked) {
            win
              .setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)))
              .catch(() => { });
          }
          break;
        }
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [enabled, windowLocked, speed, nearThreshold, sleepTimeout, halfSize, transition, setWalkDir]);

  return { petState, currentAnimation };
}
