import type { AnimationConfig } from "../types/pet";

/**
 * Generates a placeholder sprite sheet using the browser Canvas 2D API.
 *
 * Each frame is a 32×32 (or custom-sized) colored square with:
 *  - A distinct background hue cycling through a pastel palette
 *  - A rounded "body" shape so frames look like cartoon sprites
 *  - The frame index printed in the center for debugging
 *
 * Returns a PNG data URL that can be used directly as a spritesheet URL
 * without any real sprite assets on disk.
 *
 * @param frameCount  Total number of frames to generate (default 18)
 * @param frameSize   Width and height of each square frame in pixels (default 32)
 */
export function generatePlaceholderSpritesheet(
  frameCount = 18,
  frameSize = 32
): string {
  const canvas = document.createElement("canvas");
  canvas.width = frameCount * frameSize;
  canvas.height = frameSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Pastel palette — 12 hues, cycling
  const hues = [0, 30, 60, 120, 165, 195, 210, 240, 270, 300, 330, 350];

  for (let i = 0; i < frameCount; i++) {
    const x = i * frameSize;
    const hue = hues[i % hues.length];
    const p = frameSize; // alias for readability

    // ── Background ─────────────────────────────────────────────────────────
    ctx.fillStyle = `hsl(${hue}, 65%, 78%)`;
    ctx.fillRect(x, 0, p, p);

    // ── Body (rounded rect) ────────────────────────────────────────────────
    const pad = Math.round(p * 0.15);
    const r = Math.round(p * 0.2);
    const bx = x + pad;
    const by = pad;
    const bw = p - pad * 2;
    const bh = p - pad * 2;

    ctx.fillStyle = `hsl(${hue}, 55%, 55%)`;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + r, r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.arcTo(bx + bw, by + bh, bx + bw - r, by + bh, r);
    ctx.lineTo(bx + r, by + bh);
    ctx.arcTo(bx, by + bh, bx, by + bh - r, r);
    ctx.lineTo(bx, by + r);
    ctx.arcTo(bx, by, bx + r, by, r);
    ctx.closePath();
    ctx.fill();

    // ── Simulated "eyes" (two dots) ───────────────────────────────────────
    const eyeY = by + Math.round(bh * 0.38);
    const eyeR = Math.max(1, Math.round(p * 0.06));
    const eyeOff = Math.round(bw * 0.22);
    const cx = bx + bw / 2;

    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.beginPath();
    ctx.arc(cx - eyeOff, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + eyeOff, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // ── Frame index label ─────────────────────────────────────────────────
    const fontSize = Math.max(6, Math.round(p * 0.22));
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(String(i), x + p / 2, p - 2);
  }

  return canvas.toDataURL("image/png");
}

// ─── Pre-built placeholder animations ────────────────────────────────────────

/**
 * Animation definitions that match the placeholder sprite sheet.
 * Drop these directly into PetRenderer as the `animations` prop.
 */
export const PLACEHOLDER_ANIMATIONS: Record<string, AnimationConfig> = {
  idle:       { frames: [0, 1],             fps: 2, loop: true  },
  walk:       { frames: [2, 3, 4, 5],       fps: 8, loop: true  },
  walk_right: { frames: [2, 3, 4, 5],       fps: 8, loop: true  },
  walk_left:  { frames: [6, 7, 8, 9],       fps: 8, loop: true  },
  happy:      { frames: [10, 11, 12],       fps: 6, loop: true  },
  thinking:   { frames: [13, 14],           fps: 3, loop: true  },
  sleep:      { frames: [15, 16],           fps: 1, loop: true  },
  scratch:    { frames: [12, 13, 14],       fps: 6, loop: true  },
  yawn:       { frames: [15, 16, 17],       fps: 4, loop: false, next: "idle" },
};

/** Ordered list for cycling through animations in the demo */
export const ANIMATION_CYCLE = [
  "idle",
  "walk_right",
  "walk_left",
  "happy",
  "thinking",
  "sleep",
  "scratch",
  "yawn",
] as const;
