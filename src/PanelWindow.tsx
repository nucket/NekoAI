import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useConfigStore } from "./store/configStore";

// Layout constants — keep in sync with the parent App's expectations
const MENU_W = 190;
const MENU_H = 260;

const PET_SIZES: { label: string; value: number }[] = [
  { label: "S",  value: 32  },
  { label: "M",  value: 64  },
  { label: "L",  value: 96  },
  { label: "XL", value: 128 },
];

interface Props {
  route: string;
}

/**
 * Lightweight shell rendered inside the secondary `panel` Tauri window.
 * The main window keeps rendering the NekoAI sprite at all times; this window
 * is purely for the floating context menu / settings / pet selector, so the
 * pet can keep following the cursor while the user is choosing an option.
 */
export function PanelWindow({ route }: Props) {
  if (route === "context-menu") return <ContextMenuPanel />;
  return null;
}

// ─── Context menu panel ───────────────────────────────────────────────────────

function ContextMenuPanel() {
  const { config, loadConfig, isLoaded, setPetMode } = useConfigStore();

  useEffect(() => { if (!isLoaded) loadConfig(); }, [isLoaded, loadConfig]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    // Focus the panel so keyboard events register immediately
    getCurrentWindow().setFocus().catch(() => {});
  }, []);

  const close = () => invoke("close_panel_window").catch(console.error);

  // Use Rust relay: JS emit() may not reach other windows reliably in Tauri v2.
  const panelAction = (action: string) =>
    invoke("panel_action", { action }).catch(console.error);

  const openSettings  = () => panelAction("settings");
  const openSelectPet = () => panelAction("select-pet");
  const quit          = () => invoke("quit_app").catch(console.error);

  const currentSize = config.petSize ?? 48;
  const currentMode = config.petMode ?? 'work';

  return (
    <div style={styles.root} onClick={close}>
      <div style={styles.menu} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>🐱 NekoAI</span>
          <button style={styles.closeBtn} onClick={close} title="Close">✕</button>
        </div>
        <div style={styles.divider} />

        <button style={styles.item} onClick={openSettings}>⚙ Settings</button>
        <button style={styles.item} onClick={openSelectPet}>🐾 Select Pet</button>

        <div style={styles.divider} />

        <div style={styles.modeRow}>
          <span style={styles.modeLabel}>Mode</span>
          <div style={styles.modeBtns}>
            <button
              style={{ ...styles.modeBtn, ...(currentMode === 'work' ? styles.modeBtnActive : {}) }}
              onClick={() => { setPetMode('work'); panelAction('pet-mode:work'); }}
              title="Follow mouse cursor"
            >
              💼 Work
            </button>
            <button
              style={{ ...styles.modeBtn, ...(currentMode === 'play' ? styles.modeBtnActive : {}) }}
              onClick={() => { setPetMode('play'); panelAction('pet-mode:play'); }}
              title="Wander freely"
            >
              🎮 Play
            </button>
          </div>
        </div>

        <div style={styles.divider} />

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
                onClick={() => panelAction(`pet-size:${value}`)}
                title={`${value}px`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.divider} />

        <button style={styles.quitItem} onClick={quit}>✕ Quit NekoAI</button>
      </div>
    </div>
  );
}


const styles: Record<string, React.CSSProperties> = {
  root: {
    position:       "fixed",
    inset:          0,
    width:          MENU_W,
    height:         MENU_H,
    display:        "flex",
    alignItems:     "flex-start",
    justifyContent: "center",
    paddingTop:     6,
    boxSizing:      "border-box",
    // Prevent Windows transparent-window click-through on alpha=0 areas
    background:     "rgba(0,0,0,0.01)",
  },
  menu: {
    background:  "rgba(20, 20, 30, 0.97)",
    border:      "1px solid #3a3a5c",
    borderRadius: 10,
    width:       MENU_W - 8,
    color:       "#e0e0e0",
    fontFamily:  "system-ui, sans-serif",
    fontSize:    13,
    boxShadow:   "0 4px 24px rgba(0,0,0,0.7)",
    overflow:    "hidden",
  },
  header: {
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "center",
    padding:        "8px 10px 6px",
    background:     "rgba(255,255,255,0.04)",
  },
  title: { fontWeight: 700, fontSize: 13, color: "#fff" },
  closeBtn: {
    background: "rgba(0,0,0,0.01)", border: "none", color: "#666",
    cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px",
  },
  divider: { borderTop: "1px solid #2a2a3c", margin: "2px 0" },
  item: {
    display: "block", width: "100%", background: "rgba(0,0,0,0.01)", border: "none",
    color: "#e0e0e0", textAlign: "left", padding: "8px 12px",
    fontSize: 13, cursor: "pointer",
  },
  sizeRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "7px 12px",
  },
  sizeLabel: {
    fontSize: 11, color: "#777",
    textTransform: "uppercase" as const, letterSpacing: "0.05em",
  },
  sizeBtns: { display: "flex", gap: 4 },
  sizeBtn: {
    background: "#1a1a2e", border: "1px solid #3a3a5c", borderRadius: 5,
    color: "#999", cursor: "pointer", fontSize: 11, fontWeight: 600,
    padding: "3px 7px", minWidth: 28,
  },
  sizeBtnActive: { background: "#3a3a6c", borderColor: "#7878cc", color: "#cceeff" },
  modeRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "7px 12px",
  },
  modeLabel: {
    fontSize: 11, color: "#777",
    textTransform: "uppercase" as const, letterSpacing: "0.05em",
  },
  modeBtns: { display: "flex", gap: 4 },
  modeBtn: {
    background: "#1a1a2e", border: "1px solid #3a3a5c", borderRadius: 5,
    color: "#999", cursor: "pointer", fontSize: 11, fontWeight: 600,
    padding: "3px 8px",
  },
  modeBtnActive: { background: "#3a3a6c", borderColor: "#7878cc", color: "#cceeff" },
  quitItem: {
    display: "block", width: "100%", background: "rgba(0,0,0,0.01)", border: "none",
    color: "#e05555", textAlign: "left", padding: "8px 12px",
    fontSize: 13, cursor: "pointer",
  },
};
