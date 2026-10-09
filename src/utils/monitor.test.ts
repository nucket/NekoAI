import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Monitor } from '@tauri-apps/api/window'
import {
  bubbleSpriteOffset,
  bubbleWindowLayout,
  clampToRect,
  quadrantAnchor,
  workAreaOf,
} from './monitor'

function monitor(workArea: { x: number; y: number; width: number; height: number }): Monitor {
  return {
    name: 'test',
    scaleFactor: 1.5,
    position: { x: -1920, y: 0 },
    size: { width: 1920, height: 1080 },
    workArea: {
      position: { x: workArea.x, y: workArea.y },
      size: { width: workArea.width, height: workArea.height },
    },
  } as unknown as Monitor
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('workAreaOf', () => {
  it('returns the work area (taskbar excluded) on any edge', () => {
    expect(workAreaOf(monitor({ x: -1920, y: 0, width: 1920, height: 1032 }))).toEqual({
      x: -1920,
      y: 0,
      width: 1920,
      height: 1032,
    })
    expect(workAreaOf(monitor({ x: -1848, y: 0, width: 1848, height: 1080 }))).toEqual({
      x: -1848,
      y: 0,
      width: 1848,
      height: 1080,
    })
  })

  it('falls back to the full monitor bounds when the work area is empty', () => {
    expect(workAreaOf(monitor({ x: 0, y: 0, width: 0, height: 0 }))).toEqual({
      x: -1920,
      y: 0,
      width: 1920,
      height: 1080,
    })
  })

  it('falls back to the screen API (in physical px) when there is no monitor', () => {
    vi.stubGlobal('window', {
      devicePixelRatio: 1.5,
      screen: { availWidth: 1280, availHeight: 680 },
    })
    expect(workAreaOf(null)).toEqual({ x: 0, y: 0, width: 1920, height: 1020 })
  })
})

const area = { x: -1920, y: 0, width: 1920, height: 1032 }

describe('clampToRect', () => {
  it('keeps a box inside the area', () => {
    expect(clampToRect(-100, 500, 300, 200, { x: 0, y: 0, width: 1000, height: 600 })).toEqual({
      x: 0,
      y: 400,
    })
    expect(clampToRect(100, 100, 300, 200, { x: 0, y: 0, width: 1000, height: 600 })).toEqual({
      x: 100,
      y: 100,
    })
  })
})

describe('quadrantAnchor', () => {
  it('grows toward the roomier side of the area', () => {
    // Top-left quadrant: opens right and below the cursor.
    expect(quadrantAnchor({ x: -1800, y: 100 }, 285, 390, area)).toEqual({ x: -1800, y: 100 })
    // Bottom-right quadrant: opens left and above the cursor.
    expect(quadrantAnchor({ x: -100, y: 1000 }, 285, 390, area)).toEqual({ x: -385, y: 610 })
  })

  it('clamps a box that would leave the area', () => {
    expect(quadrantAnchor({ x: -1000, y: 900 }, 285, 1200, area)).toEqual({ x: -1000, y: 0 })
  })
})

describe('bubbleWindowLayout', () => {
  it('opens above a sprite in the lower half, keeping the sprite in place', () => {
    const layout = bubbleWindowLayout({ x: -1000, y: 900 }, 32, 1.5, area, 300, 380)
    expect(layout.side).toBe('above')
    const offset = bubbleSpriteOffset(32, 1.5, 'above', 300, 380)
    expect({ x: layout.x + offset.x, y: layout.y + offset.y }).toEqual({ x: -1000, y: 900 })
  })

  it('opens below a sprite in the upper half and clamps to the area', () => {
    expect(bubbleWindowLayout({ x: -1900, y: 50 }, 32, 1, area, 300, 380)).toEqual({
      x: -1920,
      y: 50,
      side: 'below',
    })
  })
})
