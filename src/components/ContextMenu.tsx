import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition, PhysicalSize, LogicalSize } from '@tauri-apps/api/dpi';
import { useConfigStore } from '../store/configStore';

// ─── Layout constants ─────────────────────────────────────────────────────────

const MENU_W = 190;
const MENU_H = 220;

const PET_SIZES: { label: string; value: number }[] = [
  { label: 'S',  value: 32 },
  { label: 'M',  value: 48 },
  { label: 'L',  value: 64 },
  { label: 'XL', value: 80 },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSettings: () => void;
  onSelectPet: () => void;
}

export function ContextMenu({ isOpen, onClose, onSettings, onSelectPet }: Props) {
  const { config, setPetSize } = useConfigStore();
  // Only render menu content once window has actually expanded
  const [windowReady, setWindowReady] = useState(false);
  const savedPosRef = useRef<{ x: number; y: number } | null>(null);

  // ── Expand / collapse Tauri window ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const win = getCurrentWindow();

    async function expand() {
      const spriteSize = useConfigStore.getState().config.petSize ?? 48;
      try {
        const [pos, scale] = await Promise.all([win.outerPosition(), win.scaleFactor()]);
        if (cancelled) return;
        savedPosRef.current = { x: pos.x, y: pos.y };
        const newX = pos.x - Math.round(((MENU_W - spriteSize) / 2) * scale);
        const newY = pos.y - Math.round((MENU_H - spriteSize) * scale);
        await win.setResizable(true);
        await win.setPosition(new PhysicalPosition(newX, newY));
        await win.setSize(new PhysicalSize(MENU_W * scale, MENU_H * scale));
        await win.setResizable(false);
      } catch (err) {
        console.error('[ContextMenu] expand error:', err);
      }
      // Always reveal menu even if resize failed
      if (!cancelled) setWindowReady(true);
    }

    async function collapse() {
      const snap = savedPosRef.current;
      savedPosRef.current = null;
      if (!snap) return;
      const spriteSize = useConfigStore.getState().config.petSize ?? 48;
      try {
        await win.setResizable(true);
        await win.setSize(new LogicalSize(spriteSize, spriteSize));
        await win.setResizable(false);
        if (!cancelled) await win.setPosition(new PhysicalPosition(snap.x, snap.y));
      } catch (err) {
        console.error('[ContextMenu] collapse error:', err);
      }
    }

    if (isOpen) {
      setWindowReady(false);
      expand();
    } else {
      collapse();
    }

    return () => { cancelled = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Escape key closes ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // ── Transition helpers ─────────────────────────────────────────────────────
  // Close the menu first (restores window), then open the next panel after the
  // window restoration completes to avoid concurrent resize race conditions.
  const openAfterClose = (action: () => void) => {
    onClose();
    // Give Tauri time to restore the window to sprite size before the next
    // panel's resize effect fires (~2 IPC round-trips at most).
    setTimeout(action, 120);
  };

  if (!isOpen || !windowReady) return null;

  const currentSize = config.petSize ?? 48;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.menu} onClick={(e) => e.stopPropagation()}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={styles.header}>
          <span style={styles.title}>🐱 NekoAI</span>
          <button style={styles.closeBtn} onClick={onClose} title="Close">✕</button>
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
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position:       'fixed',
    inset:          0,
    zIndex:         200,
    display:        'flex',
    // menu anchored to top; window expands upward so menu fills from top down
    alignItems:     'flex-start',
    justifyContent: 'center',
    paddingTop:     4,
  },
  menu: {
    background:  'rgba(20, 20, 30, 0.97)',
    border:      '1px solid #3a3a5c',
    borderRadius: 10,
    width:       MENU_W - 8,
    color:       '#e0e0e0',
    fontFamily:  'system-ui, sans-serif',
    fontSize:    13,
    boxShadow:   '0 4px 24px rgba(0,0,0,0.7)',
    overflow:    'hidden',
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '8px 10px 6px',
    background:     'rgba(255,255,255,0.04)',
  },
  title: {
    fontWeight: 700,
    fontSize:   13,
    color:      '#fff',
  },
  closeBtn: {
    background: 'transparent',
    border:     'none',
    color:      '#666',
    cursor:     'pointer',
    fontSize:   14,
    lineHeight: 1,
    padding:    '0 2px',
  },
  divider: {
    borderTop: '1px solid #2a2a3c',
    margin:    '2px 0',
  },
  item: {
    display:    'block',
    width:      '100%',
    background: 'transparent',
    border:     'none',
    color:      '#e0e0e0',
    textAlign:  'left',
    padding:    '8px 12px',
    fontSize:   13,
    cursor:     'pointer',
  },
  sizeRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '7px 12px',
  },
  sizeLabel: {
    fontSize:      11,
    color:         '#777',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  sizeBtns: {
    display: 'flex',
    gap:     4,
  },
  sizeBtn: {
    background:   '#1a1a2e',
    border:       '1px solid #3a3a5c',
    borderRadius: 5,
    color:        '#999',
    cursor:       'pointer',
    fontSize:     11,
    fontWeight:   600,
    padding:      '3px 7px',
    minWidth:     28,
  },
  sizeBtnActive: {
    background:  '#3a3a6c',
    borderColor: '#7878cc',
    color:       '#cceeff',
  },
  quitItem: {
    display:    'block',
    width:      '100%',
    background: 'transparent',
    border:     'none',
    color:      '#e05555',
    textAlign:  'left',
    padding:    '8px 12px',
    fontSize:   13,
    cursor:     'pointer',
  },
};
