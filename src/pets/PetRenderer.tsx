import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnimationDef {
  files: string[];
  fps: number;
  loop: boolean;
}

export interface PetRendererProps {
  /** Absolute path to the sprites folder on disk (e.g. .../pets/classic-neko/sprites) */
  spritesDir: string;
  /** Animation name to play (must exist in `animations`) */
  currentAnimation: string;
  /** Animation definitions loaded from pet.json */
  animations: Record<string, AnimationDef>;
  /** Render size in CSS px (sprites are 32px, scaled up) */
  displaySize?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PetRenderer({
  spritesDir,
  currentAnimation,
  animations,
  displaySize = 64,
}: PetRendererProps) {
  const [frameUrl, setFrameUrl] = useState<string>("");
  const frameIndexRef = useRef(0);
  const rafIdRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const currentAnimRef = useRef("");

  useEffect(() => {
    // Cancel previous loop
    cancelAnimationFrame(rafIdRef.current);

    const animDef = animations[currentAnimation] ?? animations["idle"];
    if (!animDef || animDef.files.length === 0) return;

    // Reset frame index when animation changes
    if (currentAnimRef.current !== currentAnimation) {
      frameIndexRef.current = 0;
      lastFrameTimeRef.current = 0;
      currentAnimRef.current = currentAnimation;
    }

    const intervalMs = 1000 / animDef.fps;

    const loop = (timestamp: number) => {
      const elapsed = timestamp - lastFrameTimeRef.current;

      if (elapsed >= intervalMs) {
        lastFrameTimeRef.current = timestamp;

        const idx = frameIndexRef.current;
        const fileName = animDef.files[idx];

        // spritesDir is already an HTTP-relative path, e.g. /pets/classic-neko/sprites
        setFrameUrl(`${spritesDir}/${fileName}`);

        // Advance frame
        const nextIdx = idx + 1;
        if (nextIdx >= animDef.files.length) {
          frameIndexRef.current = animDef.loop ? 0 : animDef.files.length - 1;
        } else {
          frameIndexRef.current = nextIdx;
        }
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [currentAnimation, animations, spritesDir]);

  if (!frameUrl) {
    // Show a transparent placeholder while the first frame loads
    return (
      <div
        style={{
          width: displaySize,
          height: displaySize,
        }}
      />
    );
  }

  return (
    <img
      src={frameUrl}
      alt="neko"
      draggable={false}
      style={{
        width: displaySize,
        height: displaySize,
        imageRendering: "pixelated",
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );
}