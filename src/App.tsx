import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

function App() {
  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button === 0) {
      const appWindow = getCurrentWindow();
      await appWindow.startDragging();
    }
  };

  return (
    <div className="app-container">
      <div
        className="sprite-container"
        onMouseDown={handleMouseDown}
        title="NekoAI - drag to move"
      >
        {/* Pet sprite will be rendered here */}
        <div className="placeholder-sprite">🐱</div>
      </div>
    </div>
  );
}

export default App;
