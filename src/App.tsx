import { useState, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PetRenderer } from "./pets/PetRenderer";
import {
  generatePlaceholderSpritesheet,
  PLACEHOLDER_ANIMATIONS,
  ANIMATION_CYCLE,
} from "./pets/placeholderSprite";
import "./App.css";

// Generate the placeholder sprite sheet once at module load time.
// In a real app this would be replaced with a LoadedPet's spritesheetUrl.
const PLACEHOLDER_URL = generatePlaceholderSpritesheet(18, 32);

function App() {
  const [animIndex, setAnimIndex] = useState(0);
  const currentAnimation = ANIMATION_CYCLE[animIndex % ANIMATION_CYCLE.length];

  // Stable reference — avoids PetRenderer's rAF loop restarting on re-render
  const animations = useMemo(() => ({ ...PLACEHOLDER_ANIMATIONS }), []);

  // Left-click + drag → move the transparent window
  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button === 0) {
      const appWindow = getCurrentWindow();
      await appWindow.startDragging();
    }
  };

  // Right-click → cycle to next animation (visual debug)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setAnimIndex((prev) => (prev + 1) % ANIMATION_CYCLE.length);
  };

  return (
    <div className="app-container">
      <div
        className="sprite-container"
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        title={`NekoAI — ${currentAnimation}\nLeft-drag to move · Right-click to cycle animations`}
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
