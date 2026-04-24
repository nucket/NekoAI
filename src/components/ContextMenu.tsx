import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { useConfigStore } from '../store/configStore'

// ─── Layout constants ─────────────────────────────────────────────────────────

const MENU_W = 190
const MENU_H = 220

// Integer multiples of the 32px native sprite → pixel-perfect scaling
const PET_SIZES: { label: string; value: number }[] = [
  { label: 'S', value: 32 }, // 1×
  { label: 'M', value: 64 }, // 2×
  { label: 'L', value: 96 }, // 3×
  { label: 'XL', value: 128 }, // 4×
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean
  onClose: () => void
  onSettings: () => void
  onSelectPet: () => void
}

export function ContextMenu({ isOpen, onClose, onSettings, onSelectPet }: Props) {
  const { config, setPetSize } = useConfigStore()
  // Only render menu content once window has actually expanded
  const [windowReady, setWindowReady] = useState(false)
  const savedPosRef = useRef<{ x: number; y: number } | null>(null)

  // ── Expand / collapse Tauri window ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const win = getCurrentWindow()

    async function expand() {
      try {
        const [pos, scale, cursor] = await Promise.all([
          win.outerPosition(),
          win.scaleFactor(),
          invoke<{ x: number; y: number }>('get_cursor_pos'),
        ])
        if (cancelled) return
        savedPosRef.current = { x: pos.x, y: pos.y }

        const screenW = window.screen.availWidth
        const screenH = window.screen.availHeight

        // Cursor position in logical pixels
        const cursorLogX = cursor.x / scale
        const cursorLogY = cursor.y / scale

        // Top half → open below cursor; bottom half → open above cursor
        // Left half → open to the right; right half → open to the left
        const openBelow = cursorLogY < screenH / 2
        const openRight = cursorLogX < screenW / 2

        let newXLog = openRight ? cursorLogX : cursorLogX - MENU_W
        let newYLog = openBelow ? cursorLogY : cursorLogY - MENU_H

        // Clamp to screen so menu never goes off-screen
        newXLog = Math.max(0, Math.min(newXLog, screenW - MENU_W))
        newYLog = Math.max(0, Math.min(newYLog, screenH - MENU_H))

        await win.setPosition(
          new PhysicalPosition(Math.round(newXLog * scale), Math.round(newYLog * scale))
        )
        // Use Rust command — JS setSize is silently blocked by resizable:false on Windows
        await invoke('resize_window', { width: MENU_W, height: MENU_H })
      } catch (err) {
        console.error('[ContextMenu] expand error:', err)
      }
      if (!cancelled) setWindowReady(true)
    }

    async function collapse() {
      const snap = savedPosRef.current
      savedPosRef.current = null
      if (!snap) return
      const spriteSize = useConfigStore.getState().config.petSize ?? 32
      try {
        await invoke('resize_window', { width: spriteSize, height: spriteSize })
        if (!cancelled) await win.setPosition(new PhysicalPosition(snap.x, snap.y))
      } catch (err) {
        console.error('[ContextMenu] collapse error:', err)
      }
    }

    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWindowReady(false)
      expand()
    } else {
      collapse()
    }

    return () => {
      cancelled = true
    }
  }, [isOpen])

  // ── Escape key closes ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // ── Transition helpers ─────────────────────────────────────────────────────
  // Close the menu first (restores window), then open the next panel after the
  // window restoration completes to avoid concurrent resize race conditions.
  const openAfterClose = (action: () => void) => {
    onClose()
    // Give Tauri time to restore the window to sprite size before the next
    // panel's resize effect fires (~2 IPC round-trips at most).
    setTimeout(action, 120)
  }

  if (!isOpen || !windowReady) return null

  const currentSize = config.petSize ?? 32

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.menu} onClick={(e) => e.stopPropagation()}>
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={styles.header}>
          <span style={styles.title}>🐱 NekoAI</span>
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div style={styles.divider} />

        {/* ── Settings ────────────────────────────────────────────────────── */}
        <button style={styles.item} onClick={() => openAfterClose(onSettings)}>
          ⚙ Settings
        </button>

        {/* ── Select Pet ──────────────────────────────────────────────────── */}
        <button style={styles.item} onClick={() => openAfterClose(onSelectPet)}>
          🐾 Select Pet
        </button>

        <div style={styles.divider} />

        {/* ── Pet Size ────────────────────────────────────────────────────── */}
        <div style={styles.sizeRow}>
          <span style={styles.sizeLabel}>Size</span>
          <div style={styles.sizeBtns}>
            {PET_SIZES.map(({ label, value }) => (
              <button
                key={value}
                style={{
                  ...styles.sizeBtn,
                  ...(currentSize === value ? styles.sizeBtnActive : {}),
                }}
                onClick={() => setPetSize(value)}
                title={`${value}px`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.divider} />

        {/* ── Quit ────────────────────────────────────────────────────────── */}
        <button style={styles.quitItem} onClick={() => invoke('quit_app')}>
          ✕ Quit NekoAI
        </button>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 6,
  },
  menu: {
    background: 'rgba(20, 20, 30, 0.97)',
    border: '1px solid #3a3a5c',
    borderRadius: 10,
    width: MENU_W - 8,
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px 6px',
    background: 'rgba(255,255,255,0.04)',
  },
  title: {
    fontWeight: 700,
    fontSize: 13,
    color: '#fff',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    padding: '0 2px',
  },
  divider: {
    borderTop: '1px solid #2a2a3c',
    margin: '2px 0',
  },
  item: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: '#e0e0e0',
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: 13,
    cursor: 'pointer',
  },
  sizeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 12px',
  },
  sizeLabel: {
    fontSize: 11,
    color: '#777',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  sizeBtns: {
    display: 'flex',
    gap: 4,
  },
  sizeBtn: {
    background: '#1a1a2e',
    border: '1px solid #3a3a5c',
    borderRadius: 5,
    color: '#999',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 7px',
    minWidth: 28,
  },
  sizeBtnActive: {
    background: '#3a3a6c',
    borderColor: '#7878cc',
    color: '#cceeff',
  },
  quitItem: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: '#e05555',
    textAlign: 'left',
    padding: '8px 12px',
    fontSize: 13,
    cursor: 'pointer',
  },
}
