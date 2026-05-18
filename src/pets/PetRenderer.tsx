import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AnimationConfig } from '../types/pet'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PetRendererProps {
  /** Absolute path to the sprites folder on disk (e.g. .../pets/classic-neko/sprites) */
  spritesDir: string
  /** Animation name to play (must exist in `animations`) */
  currentAnimation: string
  /** Animation definitions loaded from pet.json */
  animations: Record<string, AnimationConfig>
  /** Render size in CSS px (sprites are 32px, scaled up) */
  displaySize?: number
  /** When true (default), the renderer pushes a GTK shape mask to the Tauri
   *  window after each frame change so the magenta chroma-key fill becomes
   *  invisible on Linux. Set to false when the window is in a larger layout
   *  (e.g. the 300×300 speech-bubble state) — the caller is responsible for
   *  invoking `clear_window_shape` in that case. */
  applyWindowShape?: boolean
}

// ─── Image cache ──────────────────────────────────────────────────────────────
// Module-level so it survives animation changes without re-fetching.

const imageCache = new Map<string, HTMLImageElement>()

function preloadFrame(url: string): HTMLImageElement {
  let img = imageCache.get(url)
  if (!img) {
    img = new Image()
    img.src = url
    imageCache.set(url, img)
  }
  return img
}

// Push the canvas's alpha channel to the Rust side as a GTK shape region.
// Only the alpha byte of each RGBA pixel is sent (1 byte per pixel), so a
// 128×128 sprite (XL size) is 16 KiB — trivial IPC.
function pushShapeFromCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  try {
    const w = canvas.width
    const h = canvas.height
    const data = ctx.getImageData(0, 0, w, h).data
    const mask = new Uint8Array(w * h)
    for (let i = 0; i < mask.length; i++) {
      mask[i] = data[i * 4 + 3]
    }
    // Tauri serializes Uint8Array → number[] for the Vec<u8> command arg.
    invoke('set_window_shape', {
      mask: Array.from(mask),
      width: w,
      height: h,
    }).catch(() => {
      // Shape masking is best-effort; on non-Linux the command is a no-op
      // and on Linux failures (tainted canvas, etc.) just mean the magenta
      // chroma-key fill stays visible until the next successful frame.
    })
  } catch {
    // Canvas may be cross-origin tainted in rare edge cases — skip.
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PetRenderer({
  spritesDir,
  currentAnimation,
  animations,
  displaySize = 64,
  applyWindowShape = true,
}: PetRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameIndexRef = useRef(0)
  const rafIdRef = useRef(0)
  const lastFrameTimeRef = useRef(0)
  const currentAnimRef = useRef('')
  const lastShapedIndexRef = useRef(-1)

  useEffect(() => {
    cancelAnimationFrame(rafIdRef.current)

    const animDef = animations[currentAnimation] ?? animations['idle']
    if (!animDef || animDef.files.length === 0) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    // Pixel-art sprites must never be smoothed.
    ctx.imageSmoothingEnabled = false

    // 'copy' replaces destination pixels (RGB + alpha) instead of compositing
    // source-over the previous frame — sprite frames are non-overlapping by
    // design, so this is semantically correct and slightly cheaper.
    ctx.globalCompositeOperation = 'copy'

    // Force a shape push on the first frame after any prop change so the
    // chroma-key mask is rebuilt whenever the renderer (re)mounts, switches
    // animation, or the parent toggles applyWindowShape back on.
    lastShapedIndexRef.current = -1

    if (currentAnimRef.current !== currentAnimation) {
      frameIndexRef.current = 0
      lastFrameTimeRef.current = 0
      currentAnimRef.current = currentAnimation
    }

    // Pre-load every frame for this animation before the loop starts.
    const frameUrls = animDef.files.map((f) => `${spritesDir}/${f}`)
    frameUrls.forEach(preloadFrame)

    const intervalMs = 1000 / animDef.fps

    const loop = (timestamp: number) => {
      // Advance frame index only when the animation's frame interval elapses.
      if (timestamp - lastFrameTimeRef.current >= intervalMs) {
        lastFrameTimeRef.current = timestamp
        const next = frameIndexRef.current + 1
        frameIndexRef.current =
          next >= animDef.files.length ? (animDef.loop ? 0 : animDef.files.length - 1) : next
      }

      const img = preloadFrame(frameUrls[frameIndexRef.current])
      if (img.complete && img.naturalWidth > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        // Push GTK shape mask only when the frame index actually advances
        // (animation FPS, typically ≤ 12) — not every RAF tick. Skipped when
        // the parent toggles applyWindowShape off (e.g. while the speech
        // bubble is open and the window is sized 300×300).
        if (applyWindowShape && lastShapedIndexRef.current !== frameIndexRef.current) {
          pushShapeFromCanvas(canvas, ctx)
          lastShapedIndexRef.current = frameIndexRef.current
        }
      }

      rafIdRef.current = requestAnimationFrame(loop)
    }

    rafIdRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafIdRef.current)
  }, [currentAnimation, animations, spritesDir, applyWindowShape])

  return (
    <canvas
      ref={canvasRef}
      width={displaySize}
      height={displaySize}
      style={{
        display: 'block',
        width: displaySize,
        height: displaySize,
        imageRendering: 'pixelated',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    />
  )
}
