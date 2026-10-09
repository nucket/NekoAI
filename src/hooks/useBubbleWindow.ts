import { useCallback, useRef, useState } from 'react'
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import type { AnnouncementContent } from '../components/SpeechBubble'
import { useConfigStore } from '../store/configStore'
import { BUBBLE_WIN_H, BUBBLE_WIN_W, DEFAULT_PET_SIZE } from '../constants/layout'
import {
  bubbleSpriteOffset,
  bubbleWindowLayout,
  workAreaOf,
  type PhysicalPoint,
} from '../utils/monitor'

const petSize = () => useConfigStore.getState().config.petSize ?? DEFAULT_PET_SIZE

/**
 * The speech-bubble state of the main window: grows it to BUBBLE_WIN_W ×
 * BUBBLE_WIN_H around the sprite (which stays where it is on screen), restores
 * the sprite position on close, and lets the user drag the open bubble.
 */
export function useBubbleWindow() {
  const [bubbleOpen, setBubbleOpen] = useState(false)
  const [bubblePos, setBubblePos] = useState<'above' | 'below'>('above')
  const [dragging, setDragging] = useState(false)
  // Content shown instead of the chat (onboarding, the Wayland notice).
  const [announcement, setAnnouncement] = useState<AnnouncementContent | null>(null)
  // Sprite position (physical) to restore on close.
  const savedPos = useRef<PhysicalPoint | null>(null)

  const openBubble = useCallback(async () => {
    const win = getCurrentWindow()
    const [pos, monitor] = await Promise.all([win.outerPosition(), currentMonitor()])
    const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1

    const layout = bubbleWindowLayout(
      pos,
      petSize(),
      scale,
      workAreaOf(monitor),
      BUBBLE_WIN_W,
      BUBBLE_WIN_H
    )

    savedPos.current = { x: pos.x, y: pos.y }
    setBubblePos(layout.side)
    setBubbleOpen(true)

    await win.setPosition(new PhysicalPosition(layout.x, layout.y))
    await invoke('resize_window', { width: BUBBLE_WIN_W, height: BUBBLE_WIN_H })
    // Clearing the GTK shape mask is centralised in useLinuxExpandedChrome so
    // all three expand paths (bubble, settings, pet selector) share it.
  }, [])

  const closeBubble = useCallback(async () => {
    setBubbleOpen(false)
    const win = getCurrentWindow()
    if (savedPos.current) {
      const { x, y } = savedPos.current // physical coords
      const sz = petSize()
      await invoke('resize_window', { width: sz, height: sz })
      await win.setPosition(new PhysicalPosition(x, y))
      savedPos.current = null
    }
  }, [])

  // Dragging the open bubble moves the whole window; afterwards the sprite's
  // new spot becomes the position restored on close.
  const startDrag = useCallback(
    async (e: React.MouseEvent) => {
      if (e.button !== 0 || !bubbleOpen) return
      setDragging(true)
      const win = getCurrentWindow()
      await win.startDragging()
      const resume = async () => {
        const [pos, monitor] = await Promise.all([win.outerPosition(), currentMonitor()])
        const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
        const offset = bubbleSpriteOffset(petSize(), scale, bubblePos, BUBBLE_WIN_W, BUBBLE_WIN_H)
        savedPos.current = { x: pos.x + offset.x, y: pos.y + offset.y }
        setDragging(false)
        document.removeEventListener('mouseup', resume)
      }
      document.addEventListener('mouseup', resume, { once: true })
    },
    [bubbleOpen, bubblePos]
  )

  return {
    bubbleOpen,
    bubblePos,
    dragging,
    announcement,
    setAnnouncement,
    openBubble,
    closeBubble,
    startDrag,
  }
}
