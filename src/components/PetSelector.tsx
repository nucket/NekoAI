import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { useConfigStore } from "../store/configStore";

// ─── Layout constants ─────────────────────────────────────────────────────────

const SELECTOR_W = 240;
const SELECTOR_H = 280;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PetManifestEntry {
  id: string;
  name: string;
  description: string;
  emoji: string;
  author: string;
  spritesRequired?: boolean;
}

// ─── Fallback list (used if manifest.json is unavailable) ────────────────────

const FALLBACK_PETS: PetManifestEntry[] = [
  {
    id: "classic-neko",
    name: "Classic Neko",
    description: "The original Neko cat, reimagined with AI",
    emoji: "🐱",
    author: "Naudy Castellanos",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  activePetId: string;
  onSelect: (petId: string) => void;
  onClose: () => void;
}

export function PetSelector({ isOpen, activePetId, onSelect, onClose }: Props) {
  const [pets, setPets] = useState<PetManifestEntry[]>(FALLBACK_PETS);
  const savedPosRef = useRef<{ x: number; y: number } | null>(null);

  // ── Expand / collapse the main Tauri window ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const win = getCurrentWindow();

    async function expand() {
      try {
        const [pos, monitor, cursor] = await Promise.all([
          win.outerPosition(),
          currentMonitor(),
          invoke<{ x: number; y: number }>("get_cursor_pos"),
        ]);
        if (cancelled) return;
        savedPosRef.current = { x: pos.x, y: pos.y };

        const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1;
        const monX  = monitor?.position.x  ?? 0;
        const monY  = monitor?.position.y  ?? 0;
        const monW  = monitor?.size.width  ?? window.screen.availWidth  * scale;
        const monH  = monitor?.size.height ?? window.screen.availHeight * scale;

        const panelPhysW = SELECTOR_W * scale;
        const panelPhysH = SELECTOR_H * scale;

        const openBelow = (cursor.y - monY) < monH / 2;
        const openRight = (cursor.x - monX) < monW / 2;

        let x = cursor.x + (openRight ? 0 : -panelPhysW);
        let y = cursor.y + (openBelow ? 0 : -panelPhysH);
        x = Math.max(monX, Math.min(x, monX + monW - panelPhysW));
        y = Math.max(monY, Math.min(y, monY + monH - panelPhysH));

        await win.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
        await invoke("resize_window", { width: SELECTOR_W, height: SELECTOR_H });
      } catch (err) {
        console.error("[PetSelector] expand error:", err);
      }
    }

    async function collapse() {
      const snap = savedPosRef.current;
      savedPosRef.current = null;
      if (!snap) return;
      const sz = useConfigStore.getState().config.petSize ?? 48;
      try {
        await invoke("resize_window", { width: sz, height: sz });
        if (!cancelled) await win.setPosition(new PhysicalPosition(snap.x, snap.y));
      } catch (err) {
        console.error("[PetSelector] collapse error:", err);
      }
    }

    if (isOpen) expand(); else collapse();
    return () => { cancelled = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    fetch("/pets/manifest.json")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.pets)) setPets(data.pets);
      })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Select Pet</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.list}>
          {pets.map((pet) => (
            <button
              key={pet.id}
              style={{
                ...styles.petBtn,
                ...(pet.id === activePetId ? styles.petBtnActive : {}),
              }}
              onClick={() => { onSelect(pet.id); onClose(); }}
              title={pet.description}
            >
              <span style={styles.petEmoji}>{pet.emoji}</span>
              <div style={styles.petInfo}>
                <span style={styles.petName}>{pet.name}</span>
                {pet.spritesRequired && (
                  <span style={styles.petBadge}>sprites needed</span>
                )}
              </div>
              {pet.id === activePetId && <span style={styles.check}>✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    // rgba(0,0,0,0.01) prevents Windows click-through on fully-transparent areas
    // without painting a visible dark backdrop over the transparent window
    background: "rgba(0,0,0,0.01)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  panel: {
    background: "rgba(20,20,30,0.97)",
    borderRadius: 12,
    padding: "12px 14px",
    width: `${SELECTOR_W - 16}px`,
    color: "#e0e0e0",
    fontFamily: "system-ui, sans-serif",
    fontSize: 13,
    boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
    overflowY: "auto" as const,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontWeight: 700,
    fontSize: 14,
    color: "#fff",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#aaa",
    cursor: "pointer",
    fontSize: 16,
    padding: "0 2px",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  petBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#1e1e2e",
    border: "1px solid #444",
    borderRadius: 8,
    color: "#e0e0e0",
    cursor: "pointer",
    padding: "8px 10px",
    fontSize: 13,
    textAlign: "left",
  },
  petBtnActive: {
    borderColor: "#7c6af7",
    background: "#2a2a4a",
  },
  petEmoji: {
    fontSize: 18,
    flexShrink: 0,
  },
  petInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
  },
  petName: {
    fontWeight: 600,
  },
  petBadge: {
    fontSize: 10,
    color: "#888",
    fontStyle: "italic",
  },
  check: {
    marginLeft: "auto",
    color: "#7c6af7",
    fontWeight: 700,
    flexShrink: 0,
  },
};
