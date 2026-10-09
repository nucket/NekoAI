import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { currentMonitor } from '@tauri-apps/api/window'
import { useConfigStore } from '../store/configStore'
import { DEFAULT_PET_SIZE } from '../constants/layout'
import { workAreaOf } from '../utils/monitor'

export interface UseAppEventsOptions {
  spriteSize: number
  overridePosition: (x: number, y: number) => void
  openSettings: () => void
  openPetSelector: () => void
  /** A background window asked for attention; the pet has been moved under it. */
  onNotification: () => void
}

/**
 * Backend events for the main window: tray menu items, actions from the
 * context-menu panel window, and notification alerts from the desktop monitor.
 */
export function useAppEvents({
  spriteSize,
  overridePosition,
  openSettings,
  openPetSelector,
  onNotification,
}: UseAppEventsOptions) {
  useEffect(() => {
    const unlisteners = Promise.all([
      listen('tray-settings', () => openSettings()),
      listen<string>('tray-select-pet', (e) => {
        useConfigStore.getState().setActivePetId(e.payload)
        openPetSelector()
      }),

      // Actions emitted from the secondary panel window (context menu)
      listen<string>('panel-action', (e) => {
        const action = e.payload
        if (action === 'settings') {
          openSettings()
        } else if (action === 'select-pet') {
          openPetSelector()
        } else if (action.startsWith('pet-size:')) {
          const size = parseInt(action.split(':')[1], 10)
          if (!isNaN(size)) useConfigStore.getState().setPetSize(size)
        } else if (action.startsWith('pet-mode:')) {
          const m = action.split(':')[1] as 'buddy' | 'wanderer'
          if (m === 'buddy' || m === 'wanderer') useConfigStore.getState().setPetMode(m)
        } else if (action.startsWith('house_pos:')) {
          const [xStr, yStr] = action.split(':')[1].split(',')
          const x = parseInt(xStr, 10)
          const y = parseInt(yStr, 10)
          if (!isNaN(x) && !isNaN(y)) {
            const scale = window.devicePixelRatio || 1
            // Position pet to the left of the house with a 4-px physical gap
            overridePosition(x - spriteSize * scale - Math.round(4 * scale), y)
          }
        }
      }),

      // Notification alert from background monitor
      listen<{
        title: string
        process_name: string
        rect: { x: number; y: number; width: number; height: number }
      }>('neko-notification', async (e) => {
        try {
          const monitor = await currentMonitor()
          const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
          const area = workAreaOf(monitor)
          const sz = useConfigStore.getState().config.petSize ?? DEFAULT_PET_SIZE

          // Target Y: bottom of the work area, i.e. just above the taskbar /
          // dock wherever it sits (nothing to avoid when it auto-hides).
          const targetY = area.y + area.height - sz * scale

          // Target X: center of the notifying window. The rect is already in
          // physical px (GetWindowRect in a per-monitor DPI-aware process, X11
          // geometry), so it must not be scaled again.
          const windowCenterX = e.payload.rect.x + e.payload.rect.width / 2
          const targetX = Math.max(
            area.x,
            Math.min(area.x + area.width - sz * scale, windowCenterX)
          )

          overridePosition(Math.round(targetX), Math.round(targetY))
          onNotification()
        } catch {
          // silently skip if positioning fails
        }
      }),
    ])
    return () => {
      unlisteners.then((fns) => fns.forEach((fn) => fn()))
    }
  }, [spriteSize, overridePosition, openSettings, openPetSelector, onNotification])
}
