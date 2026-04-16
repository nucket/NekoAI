import { useState, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PetRenderer } from "./pets/PetRenderer";
import {
  generatePlaceholderSpritesheet,
  PLACEHOLDER_ANIMATIONS,
} from "./pets/placeholderSprite";
import { usePetMovement } from "./hooks/usePetMovement";
import "./App.css";

// Generated once at module load — in a real app, this comes from LoadedPet.
const PLACEHOLDER_URL = generatePlaceholderSpritesheet(18, 32);

function App() {
  // Track whether the user is manually dragging the window so we can
  // pause autonomous movement during drag and resume afterwards.
  const [dragging, setDragging] = useState(false);

  const { petState, currentAnimation } = usePetMovement({
    speed:         3,
    nearThreshold: 50,
    sleepTimeout:  5 * 60 * 1000,
    windowSize:    128,
    enabled:       !dragging,
  });

  // Stable reference — prevents PetRenderer's rAF loop from restarting.
  const animations = useMemo(() => ({ ...PLACEHOLDER_ANIMATIONS }), []);

  // Left-click: pause movement, start native OS drag, resume when button released.
  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;

    setDragging(true);

    const win = getCurrentWindow();
    await win.startDragging();

    // startDragging() returns immediately; the OS drag ends on mouseup.
    // The webview may not receive mouseup during a native drag, so we listen
    // on the document as a fallback and also on the element itself.
    const resume = () => {
      setDragging(false);
      document.removeEventListener("mouseup", resume);
    };
    document.addEventListener("mouseup", resume, { once: true });
  };

  return (
    <div className="app-container">
      <div
        className="sprite-container"
        onMouseDown={handleMouseDown}
        data-state={petState}
        title={`NekoAI — ${petState} (${currentAnimation})`}
      >
        <PetRenderer
          spritesheetUrl={PLACEHOLDER_URL}
          currentAnimation={currentAnimation}
          animations={animations}
          frameSize={32}
          scale={3}
        />
      </div>
    </div>
  );
}

export default App;
