import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Monitor } from '@tauri-apps/api/window'
import { workAreaOf } from './monitor'

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
