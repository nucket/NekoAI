import { useRef, useEffect } from "react";
import type { AnimationConfig } from "../types/pet";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PetRendererProps {
  /** PNG sprite sheet URL — data URL, asset:// URL, or HTTP URL */
  spritesheetUrl: string;
  /** Key of the animation to play from the `animations` map */
  currentAnimation: string;
  /** Full animation map for the loaded pet */
  animations: Record<string, AnimationConfig>;
  /** Width and height of each square frame in the sprite sheet (px) */
  frameSize?: number;
  /** Playback speed override — if omitted uses the animation's own fps */
  fps?: number;
  /** Integer scale factor applied at render time (default 3 → 32px → 96px) */
  scale?: number;
}

// ─── Internal animation state (stored in a ref to avoid re-renders) ───────────

interface AnimState {
  /** Current position within the frames array of the active animation */
  framePos: number;
  /** DOMHighResTimeStamp of the last frame advance */
  lastTick: number;
  /** rAF handle so we can cancel on unmount */
  rafId: number;
  /** Which animation key is currently playing */
  currentKey: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders a pet sprite using an HTML <canvas> and requestAnimationFrame.
 *
 * Frame layout assumed: all frames are on a single horizontal row.
 * Frame N is at source x = N * frameSize, y = 0.
 *
 * While the sprite sheet image is loading, a colored placeholder is drawn
 * so the animation loop is always visually running.
 */
export function PetRenderer({
  spritesheetUrl,
  currentAnimation,
  animations,
  frameSize = 32,
  fps,
  scale = 3,
}: PetRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sprite sheet image — loaded once per URL change
  const imgRef        = useRef<HTMLImageElement | null>(null);
  const imgReadyRef   = useRef(false);

  // Mutable animation state that drives the rAF loop (no setState needed)
  const stateRef = useRef<AnimState>({
    framePos:   0,
    lastTick:   0,
    rafId:      0,
    currentKey: currentAnimation,
  });

  // ── Load sprite sheet ──────────────────────────────────────────────────────
  useEffect(() => {
    imgReadyRef.current = false;
    imgRef.current = null;

    const img = new Image();

    img.onload = () => {
      imgRef.current = img;
      imgReadyRef.current = true;
    };
    img.onerror = () => {
      console.warn(`[PetRenderer] Failed to load sprite sheet: ${spritesheetUrl}`);
    };

    img.src = spritesheetUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [spritesheetUrl]);

  // ── Reset frame counter when animation changes ─────────────────────────────
  useEffect(() => {
    const state = stateRef.current;
    if (state.currentKey !== currentAnimation) {
      state.framePos   = 0;
      state.lastTick   = 0;
      state.currentKey = currentAnimation;
    }
  }, [currentAnimation]);

  // ── rAF render loop ────────────────────────────────────────────────────────
  // Re-created only when structural props change (fps, frameSize, scale, animations).
  // currentAnimation changes are handled through stateRef above so no loop restart.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    const state = stateRef.current;

    function resolveAnim(): AnimationConfig | null {
      return (
        animations[state.currentKey] ??
        animations["idle"] ??
        null
      );
    }

    function drawFallback(frameIdx: number) {
      // Colored square with frame number — visible while image loads
      const hue = (frameIdx * 37) % 360;
      ctx!.fillStyle = `hsl(${hue}, 65%, 72%)`;
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      const fontSize = Math.max(8, Math.round(frameSize * scale * 0.25));
      ctx!.fillStyle = "rgba(0,0,0,0.5)";
      ctx!.font = `bold ${fontSize}px monospace`;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.fillText(String(frameIdx), canvas!.width / 2, canvas!.height / 2);
    }

    function tick(timestamp: DOMHighResTimeStamp) {
      const anim = resolveAnim();

      if (anim) {
        const effectiveFps = fps ?? anim.fps;
        const msPerFrame   = 1000 / effectiveFps;
        const elapsed      = timestamp - state.lastTick;

        if (elapsed >= msPerFrame) {
          // Snap lastTick to the nearest frame boundary to avoid drift
          state.lastTick = timestamp - (elapsed % msPerFrame);
          state.framePos++;

          if (state.framePos >= anim.frames.length) {
            if (anim.loop) {
              state.framePos = 0;
            } else {
              // Hold on last frame; transition to `next` animation if defined
              state.framePos = anim.frames.length - 1;
              if (anim.next && anim.next !== state.currentKey) {
                state.currentKey = anim.next;
                state.framePos   = 0;
                state.lastTick   = 0;
              }
            }
          }

          // ── Draw ──────────────────────────────────────────────────────────
          ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

          const frameIdx = anim.frames[state.framePos];

          if (imgReadyRef.current && imgRef.current) {
            ctx!.drawImage(
              imgRef.current,
              frameIdx * frameSize, // source x  (single-row sheet)
              0,                    // source y
              frameSize,            // source w
              frameSize,            // source h
              0,                    // dest x
              0,                    // dest y
              frameSize * scale,    // dest w  (scaled up)
              frameSize * scale     // dest h
            );
          } else {
            drawFallback(frameIdx);
          }
        }
      }

      state.rafId = requestAnimationFrame(tick);
    }

    state.rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(state.rafId);
    };
  }, [fps, frameSize, scale, animations]); // intentionally excludes currentAnimation

  const canvasSize = frameSize * scale;

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize}
      height={canvasSize}
      style={{ imageRendering: "pixelated", display: "block" }}
      aria-label="Pet sprite"
    />
  );
}
