import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WindowInfo {
  title: string;
  process_name: string;
  rect: { x: number; y: number; width: number; height: number };
}

export type AppCategory =
  | "coding"
  | "browsing"
  | "communication"
  | "music"
  | "other";

export interface DesktopContextResult {
  activeApp: WindowInfo | null;
  appCategory: AppCategory;
  idleMinutes: number;
}

// ─── Category maps ────────────────────────────────────────────────────────────

const CODING = [
  "code", "vim", "nvim", "neovim", "terminal", "wt", "cmd", "powershell",
  "bash", "alacritty", "kitty", "emacs", "sublime_text", "notepad++",
  "rider", "idea", "pycharm", "webstorm", "clion", "goland", "devenv",
  "cursor", "zed",
];
const BROWSING = [
  "chrome", "firefox", "msedge", "opera", "brave", "safari", "iexplore",
  "vivaldi",
];
const COMMUNICATION = [
  "slack", "discord", "zoom", "teams", "skype", "telegram", "signal",
  "whatsapp", "mattermost",
];
const MUSIC = [
  "spotify", "foobar2000", "winamp", "vlc", "musicbee", "itunes", "tidal",
  "deezer", "amazonmusic", "yt-music",
];

function categorize(processName: string): AppCategory {
  const lower = processName.toLowerCase().replace(/\.exe$/i, "");
  if (CODING.some((a) => lower.includes(a))) return "coding";
  if (BROWSING.some((a) => lower.includes(a))) return "browsing";
  if (COMMUNICATION.some((a) => lower.includes(a))) return "communication";
  if (MUSIC.some((a) => lower.includes(a))) return "music";
  return "other";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const POLL_MS = 2000;

export function useDesktopContext(): DesktopContextResult {
  const [activeApp, setActiveApp] = useState<WindowInfo | null>(null);
  const [appCategory, setAppCategory] = useState<AppCategory>("other");
  const [idleMinutes, setIdleMinutes] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const [win, idleMs] = await Promise.all([
          invoke<WindowInfo | null>("get_active_window"),
          invoke<number>("get_idle_millis"),
        ]);
        if (cancelled) return;
        setActiveApp(win ?? null);
        setAppCategory(win ? categorize(win.process_name) : "other");
        setIdleMinutes((idleMs ?? 0) / 60_000);
      } catch {
        // Tauri backend unavailable (browser preview) — skip silently
      }
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { activeApp, appCategory, idleMinutes };
}
