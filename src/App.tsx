import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { PetRenderer, AnimationDef } from "./pets/PetRenderer";
import { usePetMovement } from "./hooks/usePetMovement";
import { SpeechBubble } from "./components/SpeechBubble";
import { SettingsPanel } from "./components/SettingsPanel";
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

// ─── Placeholder AI ────────────────────────────────────────────────────────────

async function mockAI(message: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));
  const replies = [
    `Meow! You said "${message}" 🐱`,
    `*purring* "${message}"… interesting!`,
    `Nyaa~ "${message}"? Tell me more!`,
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [bubblePos, setBubblePos] = useState<"above" | "below">("above");
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Pet definition loaded from disk ────────────────────────────────────────
  const [petDef, setPetDef] = useState<PetDefinition | null>(null);
  const [spritesDir, setSpritesDir] = useState<string>("");

  const savedPos = useRef<{ x: number; y: number } | null>(null);

  // ── Load pet.json on mount ─────────────────────────────────────────────────
  // pets/ is served as static HTTP assets by Vite (dev) and bundled into
  // dist/pets/ by the vite.config build hook (production). No Tauri fs APIs needed.
  useEffect(() => {
    async function loadPet() {
      console.log("[NekoAI] Starting pet load...");
      try {
        const res = await fetch("/pets/classic-neko/pet.json");
        console.log("[NekoAI] fetch status:", res.status, res.url);
        if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.url}`);

        const def: PetDefinition = await res.json();
        console.log("[NekoAI] animations keys:", Object.keys(def.animations));

        const spritesPath = `/pets/classic-neko/${def.spritesDir}`;
        console.log("[NekoAI] spritesDir URL:", spritesPath);

        setPetDef(def);
        setSpritesDir(spritesPath);
        console.log("[NekoAI] Pet loaded successfully!");
      } catch (err) {
        console.error("[NekoAI] loadPet failed:", err);
      }
    }
    loadPet();
  }, []);

  // ── Animations from pet.json, fallback to empty while loading ─────────────
  const animations = useMemo(
    () => petDef?.animations ?? {},
    [petDef]
  );

  // ── Movement ───────────────────────────────────────────────────────────────
  const { petState, currentAnimation } = usePetMovement({
    speed: 3,
    nearThreshold: 50,
    sleepTimeout: 5 * 60 * 1000,
    windowSize: SPRITE_SIZE,
    enabled: !dragging && !bubbleOpen && !settingsOpen,
  });

  // ── Open bubble ────────────────────────────────────────────────────────────
  const openBubble = useCallback(async () => {
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const side: "above" | "below" =
      pos.y > window.screen.availHeight / 2 ? "above" : "below";

    savedPos.current = { x: pos.x, y: pos.y };
    setBubblePos(side);
    setBubbleOpen(true);

    const newX = pos.x - SPRITE_INSET_X;
    const newY =
      side === "above"
        ? pos.y - (WIN_OPEN_H - SPRITE_SIZE)
        : pos.y;

    await win.setPosition(new PhysicalPosition(newX, newY));
    await win.setSize(new PhysicalSize(WIN_OPEN_W, WIN_OPEN_H));
  }, []);

  // ── Close bubble ───────────────────────────────────────────────────────────
  const closeBubble = useCallback(async () => {
    setBubbleOpen(false);
    const win = getCurrentWindow();
    if (savedPos.current) {
      const { x, y } = savedPos.current;
      await win.setSize(new PhysicalSize(SPRITE_SIZE, SPRITE_SIZE));
      await win.setPosition(new PhysicalPosition(x, y));
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
        const spriteX = pos.x + SPRITE_INSET_X;
        const spriteY =
          bubblePos === "above" ? pos.y + (WIN_OPEN_H - SPRITE_SIZE) : pos.y;
        savedPos.current = { x: spriteX, y: spriteY };
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

      <SpeechBubble
        isOpen={bubbleOpen}
        position={bubblePos}
        onClose={closeBubble}
        onSendMessage={mockAI}
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
            currentAnimation={currentAnimation}
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