import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
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

const SPRITE_SIZE = 48;
const WIN_OPEN_W = 300;
const WIN_OPEN_H = 300;
const SPRITE_INSET_X = Math.round((WIN_OPEN_W - SPRITE_SIZE) / 2);

// ─── Pet definition type ───────────────────────────────────────────────────────

interface PetDefinition {
  name: string;
  spritesDir: string;
  animations: Record<string, AnimationDef>;
  triggers: Record<string, string>;
}


// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { isLoaded, loadConfig } = useConfigStore();

  useEffect(() => {
    if (!isLoaded) loadConfig();
  }, [isLoaded, loadConfig]);

  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [bubblePos, setBubblePos] = useState<"above" | "below">("above");
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [petSelectorOpen, setPetSelectorOpen] = useState(false);
  const [activePetId, setActivePetId] = useState("classic-neko");

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
    windowSize: SPRITE_SIZE,
    enabled: !dragging && !bubbleOpen && !settingsOpen && !petSelectorOpen,
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
    const pos = await win.outerPosition();
    const scale = await win.scaleFactor();

    // Convert physical → logical so all math matches CSS pixel units
    const logX = pos.x / scale;
    const logY = pos.y / scale;

    // screen.availWidth/Height are already in logical (CSS) pixels
    const screenW = window.screen.availWidth;
    const screenH = window.screen.availHeight;

    const side: "above" | "below" = logY > screenH / 2 ? "above" : "below";

    savedPos.current = { x: logX, y: logY };
    setBubblePos(side);
    setBubbleOpen(true);

    let newX = logX - SPRITE_INSET_X;
    let newY =
      side === "above"
        ? logY - (WIN_OPEN_H - SPRITE_SIZE)
        : logY;

    // Clamp so the expanded window never goes off-screen
    newX = Math.max(0, Math.min(newX, screenW - WIN_OPEN_W));
    newY = Math.max(0, Math.min(newY, screenH - WIN_OPEN_H));

    await win.setPosition(new LogicalPosition(newX, newY));
    await win.setSize(new LogicalSize(WIN_OPEN_W, WIN_OPEN_H));
  }, []);

  // ── Close bubble ───────────────────────────────────────────────────────────
  const closeBubble = useCallback(async () => {
    setBubbleOpen(false);
    const win = getCurrentWindow();
    if (savedPos.current) {
      const { x, y } = savedPos.current;
      // LogicalSize ensures the window matches the CSS size regardless of DPI scale
      await win.setSize(new LogicalSize(SPRITE_SIZE, SPRITE_SIZE));
      await win.setPosition(new LogicalPosition(x, y));
      savedPos.current = null;
    }
  }, []);

  // ── Interaction handlers ───────────────────────────────────────────────────
  const handleSpriteClick = useCallback(() => {
    if (!bubbleOpen && !settingsOpen) openBubble();
  }, [bubbleOpen, settingsOpen, openBubble]);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!bubbleOpen) setSettingsOpen((v) => !v);
  }, [bubbleOpen]);

  const handleMouseDown = useCallback(
    async (e: React.MouseEvent) => {
      if (e.button !== 0 || !bubbleOpen) return;
      setDragging(true);
      const win = getCurrentWindow();
      await win.startDragging();
      const resume = async () => {
        const pos = await win.outerPosition();
        const scale = await win.scaleFactor();
        const logX = pos.x / scale;
        const logY = pos.y / scale;
        // Recompute the sprite's logical position from the expanded window position
        const spriteLogX = logX + SPRITE_INSET_X;
        const spriteLogY =
          bubblePos === "above" ? logY + (WIN_OPEN_H - SPRITE_SIZE) : logY;
        savedPos.current = { x: spriteLogX, y: spriteLogY };
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
      width: SPRITE_SIZE,
      height: SPRITE_SIZE,
      left: SPRITE_INSET_X,
      top: bubblePos === "above" ? WIN_OPEN_H - SPRITE_SIZE : 0,
    } as React.CSSProperties)
    : undefined;

  return (
    <div className={`app-container${bubbleOpen ? " app-container--open" : ""}`}>
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

      <div
        className="sprite-container"
        style={spriteStyle}
        onClick={handleSpriteClick}
        onMouseDown={handleMouseDown}
        onContextMenu={handleRightClick}
        data-state={petState}
        title={
          bubbleOpen
            ? "Drag to reposition · Click X to close"
            : `${petState} — click to chat · right-click for settings`
        }
      >
        {/* Show pet only after sprites are loaded */}
        {spritesDir && Object.keys(animations).length > 0 ? (
          <PetRenderer
            spritesDir={spritesDir}
            currentAnimation={moodOverride ?? currentAnimation}
            animations={animations}
            displaySize={SPRITE_SIZE}
          />
        ) : (
          // Loading indicator while pet.json is being read
          <div
            style={{
              width: SPRITE_SIZE,
              height: SPRITE_SIZE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}
          >
            🐱
          </div>
        )}

      </div>
    </div>
  );
}