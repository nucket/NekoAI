import { useEffect, useRef } from 'react'
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

// ─── Component ────────────────────────────────────────────────────────────────

export function PetRenderer({
  spritesDir,
  currentAnimation,
  animations,
  displaySize = 64,
}: PetRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameIndexRef = useRef(0)
  const rafIdRef = useRef(0)
  const lastFrameTimeRef = useRef(0)
  const currentAnimRef = useRef('')

  useEffect(() => {
    cancelAnimationFrame(rafIdRef.current)

    const animDef = animations[currentAnimation] ?? animations['idle']
    if (!animDef || animDef.files.length === 0) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Pixel-art sprites must never be smoothed.
    ctx.imageSmoothingEnabled = false

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
      if (timestamp - lastFrameTimeRef.current >= intervalMs) {
        lastFrameTimeRef.current = timestamp

        const img = preloadFrame(frameUrls[frameIndexRef.current])

        if (img.complete && img.naturalWidth > 0) {
          // clearRect writes RGBA(0,0,0,0) to the full canvas buffer before
          // drawing the new frame. This forces WebKitGTK to report damage for
          // the entire canvas area to the XWayland compositor, preventing old
          // frame pixels from persisting on the transparent window surface
          // (the "ghost-frame stacking" bug on Linux/XWayland).
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        }

        const next = frameIndexRef.current + 1
        frameIndexRef.current =
          next >= animDef.files.length ? (animDef.loop ? 0 : animDef.files.length - 1) : next
      }

      rafIdRef.current = requestAnimationFrame(loop)
    }

    rafIdRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafIdRef.current)
  }, [currentAnimation, animations, spritesDir])

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
