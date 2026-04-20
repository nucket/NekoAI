import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { PetRenderer, AnimationDef } from "./pets/PetRenderer";
import { usePetMovement } from "./hooks/usePetMovement";
import { SpeechBubble } from "./components/SpeechBubble";
import { SettingsPanel } from "./components/SettingsPanel";
import { PetSelector } from "./components/PetSelector";
import { useConfigStore } from "./store/configStore";
import { useAppStore } from "./store";
import { createAIProvider, buildContextBlock } from "./ai";
import { loadFacts, extractAndSaveFacts } from "./ai/memory";
import { useDesktopContext } from "./hooks/useDesktopContext";
import { useMoodEngine } from "./hooks/useMoodEngine";
import "./App.css";

// ─── Layout constants ──────────────────────────────────────────────────────────

const WIN_OPEN_W = 300;
const WIN_OPEN_H = 300;

// ─── Pet definition type ───────────────────────────────────────────────────────

interface PetDefinition {
  name: string;
  spritesDir: string;
  animations: Record<string, AnimationDef>;
  triggers: Record<string, string>;
}


// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { config, isLoaded, loadConfig } = useConfigStore();
  const spriteSize = config.petSize ?? 32;
  const spriteInsetX = Math.round((WIN_OPEN_W - spriteSize) / 2);

  useEffect(() => {
    if (!isLoaded) loadConfig();
  }, [isLoaded, loadConfig]);

  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [bubblePos, setBubblePos] = useState<"above" | "below">("above");
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [petSelectorOpen, setPetSelectorOpen] = useState(false);
  const [activePetId, setActivePetId] = useState("classic-neko");

  // Context menu lives in a separate Tauri window — the main window never
  // gets taken over, so the sprite stays free to follow the cursor.
  const anyPanelOpen = settingsOpen || petSelectorOpen;

  // ── Pet definition loaded from disk ────────────────────────────────────────
  const [petDef, setPetDef] = useState<PetDefinition | null>(null);
  const [spritesDir, setSpritesDir] = useState<string>("");

  const savedPos = useRef<{ x: number; y: number } | null>(null);

  // ── Load pet.json whenever activePetId changes ────────────────────────────
  // pets/ is served as static HTTP assets by Vite (dev) and bundled into
  // dist/pets/ by the vite.config build hook (production). No Tauri fs APIs needed.
  useEffect(() => {
    async function loadPet() {
      try {
        const res = await fetch(`/pets/${activePetId}/pet.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.url}`);

        const def: PetDefinition = await res.json();
        const spritesPath = `/pets/${activePetId}/${def.spritesDir}`;

        setPetDef(def);
        setSpritesDir(spritesPath);
      } catch (err) {
        console.error("[NekoAI] loadPet failed:", err);
      }
    }
    loadPet();
  }, [activePetId]);

  // ── Tray event listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const unlisteners = Promise.all([
      listen("tray-settings", () => setSettingsOpen(true)),
      listen<string>("tray-select-pet", (e) => {
        setActivePetId(e.payload);
        setPetSelectorOpen(true);
      }),
      listen("tray-quit", () => invoke("quit_app")),
      // Actions emitted from the secondary panel window (context menu)
      listen<string>("panel-action", (e) => {
        const action = e.payload;
        if (action === "settings") {
          setSettingsOpen(true);
        } else if (action === "select-pet") {
          setPetSelectorOpen(true);
        } else if (action.startsWith("pet-size:")) {
          const size = parseInt(action.split(":")[1], 10);
          if (!isNaN(size)) useConfigStore.getState().setPetSize(size);
        } else if (action.startsWith("pet-mode:")) {
          const m = action.split(":")[1] as 'work' | 'play';
          if (m === 'work' || m === 'play') useConfigStore.getState().setPetMode(m);
        }
      }),
    ]);
    return () => { unlisteners.then((fns) => fns.forEach((fn) => fn())); };
  }, []);

  // ── Animations from pet.json, fallback to empty while loading ─────────────
  const animations = useMemo(
    () => petDef?.animations ?? {},
    [petDef]
  );

  // ── Desktop context (idle time, active app) ───────────────────────────────
  const { appCategory, idleMinutes } = useDesktopContext();

  // ── Movement ───────────────────────────────────────────────────────────────
  const { petState, currentAnimation } = usePetMovement({
    speed: 3,
    nearThreshold: 50,
    sleepTimeout: 5 * 60 * 1000,
    windowSize: spriteSize,
    enabled: !dragging && !bubbleOpen && !anyPanelOpen,
    mode: config.petMode ?? 'work',
  });

  // ── Mood engine (updates store + emits animation overrides) ──────────────
  const { moodOverride } = useMoodEngine({ idleMinutes, appCategory, petState });

  // ── AI send with persistent memory ────────────────────────────────────────
  const handleSendMessage = useCallback(async (text: string): Promise<string> => {
    const { config: cfg } = useConfigStore.getState();

    if (!cfg.apiKey && cfg.provider !== 'ollama') {
      return "Nyaa~ I need an API key to talk! Set one in Settings 🐾";
    }

    try {
      await invoke('save_message', { role: 'user', content: text });

      const [history, facts] = await Promise.all([
        invoke<Array<{ role: string; content: string }>>('get_recent_messages', { limit: 20 }),
        loadFacts(),
      ]);

      const mood = useAppStore.getState().mood;
      const systemPrompt = buildContextBlock('NekoAI', facts, mood);
      const provider = createAIProvider(cfg);
      const messages = history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const reply = await provider.sendMessage(messages, systemPrompt);

      await invoke('save_message', { role: 'assistant', content: reply });
      extractAndSaveFacts(text, reply);

      return reply;
    } catch (err) {
      console.error('[NekoAI] handleSendMessage error:', err);
      return "Sorry, something went wrong. 😿";
    }
  }, []);

  // ── Open bubble ────────────────────────────────────────────────────────────
  const openBubble = useCallback(async () => {
    const win = getCurrentWindow();
    const [pos, monitor] = await Promise.all([
      win.outerPosition(),
      currentMonitor(),
    ]);

    const sz    = useConfigStore.getState().config.petSize ?? 32;
    const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1;

    // Physical bounds of the active monitor
    const monX = monitor?.position.x  ?? 0;
    const monY = monitor?.position.y  ?? 0;
    const monW = monitor?.size.width  ?? window.screen.availWidth  * scale;
    const monH = monitor?.size.height ?? window.screen.availHeight * scale;

    // Physical sizes
    const openPhysW  = WIN_OPEN_W * scale;
    const openPhysH  = WIN_OPEN_H * scale;
    const insetPhysX = Math.round(((WIN_OPEN_W - sz) / 2) * scale);

    // Bubble above or below based on position within the active monitor
    const side: "above" | "below" = (pos.y - monY) > monH / 2 ? "above" : "below";

    // Save original sprite physical position to restore on close
    savedPos.current = { x: pos.x, y: pos.y };
    setBubblePos(side);
    setBubbleOpen(true);

    // Expanded window position: keep sprite visually in place
    let newX = pos.x - insetPhysX;
    let newY = side === "above"
      ? pos.y - Math.round((WIN_OPEN_H - sz) * scale)
      : pos.y;

    // Clamp inside the active monitor
    newX = Math.max(monX, Math.min(newX, monX + monW - openPhysW));
    newY = Math.max(monY, Math.min(newY, monY + monH - openPhysH));

    await win.setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)));
    await invoke("resize_window", { width: WIN_OPEN_W, height: WIN_OPEN_H });
  }, []);

  // ── Close bubble ───────────────────────────────────────────────────────────
  const closeBubble = useCallback(async () => {
    setBubbleOpen(false);
    const win = getCurrentWindow();
    if (savedPos.current) {
      const { x, y } = savedPos.current; // physical coords
      const sz = useConfigStore.getState().config.petSize ?? 32;
      await invoke("resize_window", { width: sz, height: sz });
      await win.setPosition(new PhysicalPosition(x, y));
      savedPos.current = null;
    }
  }, []);

  // ── Interaction handlers ───────────────────────────────────────────────────
  const handleSpriteClick = useCallback(() => {
    if (!bubbleOpen && !settingsOpen) openBubble();
  }, [bubbleOpen, settingsOpen, openBubble]);

  const handleRightClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    if (bubbleOpen || settingsOpen || petSelectorOpen) return;

    // Position the panel near the cursor on whichever monitor the pet is on,
    // in the opposite quadrant so it never goes off that screen.
    const MENU_W = 190;
    const MENU_H = 260;
    try {
      const [cursor, monitor] = await Promise.all([
        invoke<{ x: number; y: number }>("get_cursor_pos"),
        currentMonitor(),
      ]);

      // Physical bounds of the active monitor (fall back to primary-screen guess)
      const scale  = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1;
      const monX   = monitor?.position.x  ?? 0;
      const monY   = monitor?.position.y  ?? 0;
      const monW   = monitor?.size.width  ?? window.screen.availWidth  * scale;
      const monH   = monitor?.size.height ?? window.screen.availHeight * scale;

      // Menu size in physical pixels
      const menuPhysW = MENU_W * scale;
      const menuPhysH = MENU_H * scale;

      // Quadrant relative to the current monitor
      const openBelow = (cursor.y - monY) < monH / 2;
      const openRight = (cursor.x - monX) < monW / 2;

      // Anchor position (physical) then clamp inside the monitor
      let x = cursor.x + (openRight ? 0 : -menuPhysW);
      let y = cursor.y + (openBelow ? 0 : -menuPhysH);
      x = Math.max(monX, Math.min(x, monX + monW - menuPhysW));
      y = Math.max(monY, Math.min(y, monY + monH - menuPhysH));

      await invoke("open_panel_window", {
        x,           // physical
        y,           // physical
        width:  MENU_W,   // logical
        height: MENU_H,   // logical
        route: "context-menu",
      });
    } catch (err) {
      console.error("[NekoAI] open context menu failed:", err);
    }
  }, [bubbleOpen, settingsOpen, petSelectorOpen]);

  const handleMouseDown = useCallback(
    async (e: React.MouseEvent) => {
      if (e.button !== 0 || !bubbleOpen) return;
      setDragging(true);
      const win = getCurrentWindow();
      await win.startDragging();
      const resume = async () => {
        const [pos, monitor] = await Promise.all([
          win.outerPosition(),
          currentMonitor(),
        ]);
        const scale      = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1;
        const sz         = useConfigStore.getState().config.petSize ?? 32;
        const insetPhysX = Math.round(((WIN_OPEN_W - sz) / 2) * scale);
        // Sprite physical top-left within the expanded window
        const spritePhysX = pos.x + insetPhysX;
        const spritePhysY = bubblePos === "above"
          ? pos.y + Math.round((WIN_OPEN_H - sz) * scale)
          : pos.y;
        savedPos.current = { x: spritePhysX, y: spritePhysY };
        setDragging(false);
        document.removeEventListener("mouseup", resume);
      };
      document.addEventListener("mouseup", resume, { once: true });
    },
    [bubbleOpen, bubblePos]
  );

  // ── Sprite position when bubble is open ────────────────────────────────────
  const spriteStyle = bubbleOpen
    ? ({
      position: "absolute" as const,
      width: spriteSize,
      height: spriteSize,
      left: spriteInsetX,
      top: bubblePos === "above" ? WIN_OPEN_H - spriteSize : 0,
    } as React.CSSProperties)
    : undefined;

  // Container size must match petSize exactly to avoid a visible border/gap
  const containerStyle = bubbleOpen
    ? undefined
    : { width: spriteSize, height: spriteSize };

  return (
    <div
      className={`app-container${bubbleOpen ? " app-container--open" : ""}`}
      style={containerStyle}
    >
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <PetSelector
        isOpen={petSelectorOpen}
        activePetId={activePetId}
        onSelect={setActivePetId}
        onClose={() => setPetSelectorOpen(false)}
      />

      <SpeechBubble
        isOpen={bubbleOpen}
        position={bubblePos}
        onClose={closeBubble}
        onSendMessage={handleSendMessage}
      />

      {/* Hide sprite while any panel occupies the window so it doesn't
          leak into the transparent area behind the menu/settings card */}
      {!anyPanelOpen && <div
        className="sprite-container"
        style={spriteStyle ?? containerStyle}
        onClick={handleSpriteClick}
        onMouseDown={handleMouseDown}
        onContextMenu={handleRightClick}
        data-state={petState}
        title={
          bubbleOpen
            ? "Drag to reposition · Click X to close"
            : `${petState} — click to chat · right-click for menu`
        }
      >
        {/* Show pet only after sprites are loaded */}
        {spritesDir && Object.keys(animations).length > 0 ? (
          <PetRenderer
            spritesDir={spritesDir}
            currentAnimation={moodOverride ?? currentAnimation}
            animations={animations}
            displaySize={spriteSize}
          />
        ) : (
          // Loading indicator while pet.json is being read
          <div
            style={{
              width: spriteSize,
              height: spriteSize,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}
          >
            🐱
          </div>
        )}

      </div>}
    </div>
  );
}