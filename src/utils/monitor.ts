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
