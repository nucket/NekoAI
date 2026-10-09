import type { Monitor } from '@tauri-apps/api/window'

export interface PhysicalRect {
  x: number
  y: number
  width: number
  height: number
}

// The usable part of a monitor in physical pixels: its work area, which
// excludes the taskbar / dock / panels on whichever edge they sit (or nothing
// when they auto-hide). Use this instead of guessing a taskbar height.
// Falls back to the full monitor bounds, then to the screen API when no
// monitor could be resolved (e.g. a hidden window before first placement).
export function workAreaOf(monitor: Monitor | null): PhysicalRect {
  const area = monitor?.workArea
  if (area && area.size.width > 0 && area.size.height > 0) {
    return {
      x: area.position.x,
      y: area.position.y,
      width: area.size.width,
      height: area.size.height,
    }
  }
  if (monitor) {
    return {
      x: monitor.position.x,
      y: monitor.position.y,
      width: monitor.size.width,
      height: monitor.size.height,
    }
  }
  const scale = window.devicePixelRatio || 1
  return {
    x: 0,
    y: 0,
    width: window.screen.availWidth * scale,
    height: window.screen.availHeight * scale,
  }
}

export interface PhysicalPoint {
  x: number
  y: number
}

/** Top-left that keeps a `width`×`height` box (physical px) inside `area`. */
export function clampToRect(
  x: number,
  y: number,
  width: number,
  height: number,
  area: PhysicalRect
): PhysicalPoint {
  return {
    x: Math.max(area.x, Math.min(x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - height)),
  }
}

/**
 * Opens a `width`×`height` box (physical px) at the cursor, growing toward the
 * side of `area` with more room, then clamps it inside `area`. Used by the
 * context menu, Settings and the pet selector.
 */
export function quadrantAnchor(
  cursor: PhysicalPoint,
  width: number,
  height: number,
  area: PhysicalRect
): PhysicalPoint {
  const openBelow = cursor.y - area.y < area.height / 2
  const openRight = cursor.x - area.x < area.width / 2
  return clampToRect(
    cursor.x + (openRight ? 0 : -width),
    cursor.y + (openBelow ? 0 : -height),
    width,
    height,
    area
  )
}

export interface BubbleWindowLayout extends PhysicalPoint {
  /** Whether the bubble sits above or below the sprite. */
  side: 'above' | 'below'
}

/**
 * Where to put the expanded speech-bubble window (`winW`×`winH` logical px) so
 * the sprite at `spritePos` (physical) stays where it is: the bubble opens
 * above the sprite in the lower half of `area` and below it in the upper half.
 */
export function bubbleWindowLayout(
  spritePos: PhysicalPoint,
  spriteSize: number,
  scale: number,
  area: PhysicalRect,
  winW: number,
  winH: number
): BubbleWindowLayout {
  const side = spritePos.y - area.y > area.height / 2 ? 'above' : 'below'
  const origin = bubbleSpriteOffset(spriteSize, scale, side, winW, winH)
  const { x, y } = clampToRect(
    spritePos.x - origin.x,
    spritePos.y - origin.y,
    winW * scale,
    winH * scale,
    area
  )
  return { x: Math.round(x), y: Math.round(y), side }
}

/** The sprite's top-left inside the expanded bubble window (physical px). */
export function bubbleSpriteOffset(
  spriteSize: number,
  scale: number,
  side: 'above' | 'below',
  winW: number,
  winH: number
): PhysicalPoint {
  return {
    x: Math.round(((winW - spriteSize) / 2) * scale),
    y: side === 'above' ? Math.round((winH - spriteSize) * scale) : 0,
  }
}
