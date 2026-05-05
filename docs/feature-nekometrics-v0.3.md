# NekoMetrics — v0.3 Implementation Spec

> Self-contained specification for an AI agent (e.g. Claude Sonnet) to implement the NekoMetrics feature without prior context. Read this file end-to-end before starting. All file paths in this document are relative to the repo root unless otherwise noted.

---

## 1. Goal

Add **anonymous, on-device usage metrics** to NekoAI:

- **Keystrokes** — global key-press count (count only, never the key itself).
- **Mouse clicks** — global mouse-button count (no coordinates, no captures).
- **NekoAI steps** — distance the pet has walked, expressed in "steps".

The metrics are surfaced through:

1. A **right-click context menu on the house window** (the small house at the bottom-right of the screen).
2. An **animated tooltip** that pops up above the house when any counter is enabled, displaying live numbers.
3. **History views** — totals per day/week/month and an optional GitHub-style heatmap reachable from the menu.

Inspiration: [BongoCat](https://github.com/Externalizable/bongo-cat) — viral reactive desktop pet that animates its paws on keystrokes. We borrow the _spirit_ (idle desktop pet that visualises input activity) but keep our own art and architecture.

> **Privacy non-negotiable**: counts only, no key codes, no clipboards, no screen contents, no network calls. All metric data stays in the local SQLite DB the app already uses (`~/.local/share/nekoai/memory.db` on Linux, `%APPDATA%\nekoai\memory.db` on Windows, `~/Library/Application Support/nekoai/memory.db` on macOS).

---

## 2. Scope summary

| Area             | In scope                                                                                              | Out of scope                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| House menu       | Right-click → menu with: Select Pet · Count Keystrokes · Count NekoAI Steps · Settings · About · Quit | Drag-to-reposition house                                   |
| Tooltip          | Slide-up + fade animation, live numbers, click-to-dismiss, multi-line                                 | Charts inside the tooltip                                  |
| Counters         | Keystrokes (global), mouse clicks (global), pet steps (in-app)                                        | Window-focus duration, app-usage breakdown (defer to v0.4) |
| Storage          | `metrics_daily` table + lifetime totals, atomic upsert, batched writes                                | Cloud sync                                                 |
| History UI       | "Activity" panel — daily list, weekly bar chart, monthly heatmap                                      | Per-app heatmaps                                           |
| Reactive sprites | BongoCat-style paw-tap variant for `classic-neko` only                                                | Per-key paw mapping (left/right hand)                      |
| Anonymity        | No content captured, opt-in toggles, can be disabled at any time                                      | Telemetry to a server                                      |

---

## 3. Open questions to confirm with the maintainer

Treat these as **flag-and-pause** points. Do not silently invent answers.

1. **Counters off by default?** Recommended: yes (privacy-first first-run UX). Confirm.
2. **Pet steps definition** — pick one (recommended: B):
   - **A** — every 32 logical px traversed = 1 step (simplest).
   - **B** — every full walk-cycle (4-frame loop of `walk_*` animation) = 1 step (most natural, matches the leg animation).
   - **C** — 1 step per second of `walk_*` animation playback (decoupled from movement speed).
3. **Reactive paw animation scope** — only `classic-neko` for v0.3, or all bundled pets? Recommended: classic-neko only; document the new optional `pet.json` field so the rest can opt in over time.
4. **About panel content** — link to GitHub + version, or also include credits/donations? Default: GitHub + version + license + author handle.
5. **History retention** — keep all rows, or auto-prune after N months? Recommended: keep all (rows are tiny: < 100 bytes/day).

---

## 4. UX specification

### 4.1 House right-click menu

Native OS context menu (use Tauri `tauri::menu`, **not** an HTML menu, to match the system tray's look):

```
┌────────────────────────────┐
│ 🐾 Select Pet            ▶ │
├────────────────────────────┤
│ ⌨ Count Keystrokes      ☐ │   ← checkable, persisted
│ 🐈 Count NekoAI Steps   ☐ │   ← checkable, persisted
│ 📈 View Activity…          │   ← opens history window
├────────────────────────────┤
│ ⚙ Settings                 │
│ ℹ About NekoAI             │
├────────────────────────────┤
│ ⏻ Quit                     │
└────────────────────────────┘
```

- **Select Pet** — submenu mirroring the existing tray submenu (Classic Neko, Ghost, Ember, Pingu, Shiba). Use the same `tray-select-pet` event channel.
- **Count Keystrokes / Count NekoAI Steps** — toggle checkmarks; persist in `AIConfig` (see §6.3). Mouse clicks share the keystroke toggle (one toggle = both keyboard + mouse counters, since both are "input activity"). Pet steps has its own toggle.
- **View Activity** — opens a new Tauri window `activity` (route `#/activity`) with daily/weekly/monthly views.
- **Settings / About / Quit** — emit `panel-action` events `settings`, `about`, `quit` and reuse the existing handlers in `lib.rs`. Add `about` action that opens panel route `#/about`.

### 4.2 Tooltip above the house

Visibility rule: the tooltip is rendered only when **at least one counter toggle is on**.

- **Window** — new Tauri window `metrics` (route `#/metrics`), transparent, frameless, click-through optional, always-on-top, skip taskbar. Width auto, height ~56 px (1 line) or ~80 px (2 lines).
- **Position** — anchored 8 px above the house, horizontally centered on the house's center. Reposition on `tauri-runtime` window-move events from the `house` window (not relevant today since house is static, but listen anyway for future drag support).
- **Animation** — on first show: 200 ms slide-up (8 px) + fade-in (`ease-out`). On hide: 150 ms fade-out (`ease-in`).
- **Number animation** — when a counter increments, animate the digit roll using a CSS transform on each digit (200 ms `ease-out`). Cap at 30 fps to avoid burning CPU during typing storms.
- **Layout** (see ASCII):

```
┌────────────────────────────────┐
│  ⌨ 12,438   🖱 1,021           │   ← row 1: input (when keystroke toggle on)
│  🐈 387 steps                   │   ← row 2: pet steps (when steps toggle on)
└────────────────────────────────┘
              ▼ (small triangle pointing to house)
            [🏠 house]
```

- **Numeric formatting** — locale-aware thousand separators via `Intl.NumberFormat()`.
- **Period selector** — small "Today ⌄" pill on the top-right of the tooltip; clicking opens a tiny dropdown with `Today / This week / This month / All time`. Persist last-used period per session (in-memory, not config).
- **Click-through** — by default the tooltip blocks clicks (so the user can interact with the period selector). Add an "Allow click-through" sub-option in Settings later (defer if not trivial).

### 4.3 Reactive paw animation (BongoCat-inspired)

When the keystroke toggle is on **and** the active pet declares the `reactive_paws` capability in `pet.json`, the pet plays a tap animation each time a key is pressed:

- Animation key: `on_keystroke` (new trigger).
- Behaviour: play a single-frame paw-down for ~80 ms, then return to the previous animation. Throttle: at most one tap per 60 ms (so a fast typist sees a continuous tap loop, not skipped frames).
- Mouse clicks: play `on_click` (new trigger), same shape.
- Mapping is per-pet. Document the new triggers in `docs/creating-a-pet.md` after implementation.

---

## 5. Architecture

### 5.1 New Rust module — `src-tauri/src/input_monitor.rs`

Responsibilities:

- Install global low-level hooks for keyboard + mouse on a dedicated thread.
- Expose three atomic counters (`AtomicU64`) updated from the hook thread.
- Provide a snapshot getter `pub fn snapshot() -> InputSnapshot` for the writer task.
- Emit Tauri events on each event for the reactive-paws animation:
  - `nekometrics:key` (no payload)
  - `nekometrics:click` (no payload)

Implementation choice — pick **one**:

- **Option 1 — `rdev` crate** (cross-platform, easiest): one listener thread, blocking `listen()` loop, increment counters and emit events. Good fit, MIT licensed. Watch out: requires Accessibility permission on macOS.
- **Option 2 — `windows` crate `SetWindowsHookExW`** (Windows-only, smallest binary impact): we already depend on `windows`. Use `WH_KEYBOARD_LL` + `WH_MOUSE_LL`. Linux/macOS branches `#[cfg(...)]` would still need an alternative — defer cross-platform until v0.4.

**Recommendation**: **Option 1** for cleaner cross-platform parity, with a feature flag `cargo feature input-monitor` that disables it for headless test builds.

### 5.2 New Rust module — `src-tauri/src/metrics.rs`

- `MetricsAggregator` — owns the input-monitor counters + a snapshot of the previous flush.
- Background task (`tokio::time::interval(Duration::from_secs(5))` or plain thread + `sleep`): every 5 s, read deltas and call `storage::increment_metrics_today(keys, clicks, steps)`.
- Public Tauri commands:
  - `get_metrics(period: "today" | "week" | "month" | "all") -> Metrics`
  - `get_metrics_history(period: "daily" | "weekly" | "monthly", limit: u32) -> Vec<MetricsBucket>`
  - `set_counter_enabled(counter: "input" | "steps", enabled: bool) -> Result<()>` — flips the bit in `AIConfig` and emits `config-updated`.
  - `record_pet_steps(steps: u32)` — called from the JS side (the pet movement code knows the truth).

### 5.3 Storage — extend `src-tauri/src/storage.rs`

New table (manual migration, follow the same pattern already used for existing tables):

```sql
CREATE TABLE IF NOT EXISTS metrics_daily (
  date         TEXT PRIMARY KEY,    -- 'YYYY-MM-DD' in user's local timezone
  keystrokes   INTEGER NOT NULL DEFAULT 0,
  mouse_clicks INTEGER NOT NULL DEFAULT 0,
  pet_steps    INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL     -- unix epoch seconds
);
CREATE INDEX IF NOT EXISTS idx_metrics_daily_date ON metrics_daily(date DESC);
```

Functions to add:

```rust
pub fn increment_metrics_today(keys: u64, clicks: u64, steps: u64) -> Result<(), String>;
pub fn get_metrics_for_range(start: &str, end: &str) -> Result<Vec<DailyMetrics>, String>;
pub fn get_metrics_lifetime() -> Result<DailyMetrics, String>;
```

Use `INSERT ... ON CONFLICT(date) DO UPDATE SET keystrokes = keystrokes + ?, mouse_clicks = mouse_clicks + ?, pet_steps = pet_steps + ?, updated_at = ?` for atomic upserts.

`AIConfig` extension (same `config.toml`, just add fields with `#[serde(default)]`):

```rust
#[serde(default)] pub metrics_input_enabled: bool,   // default false
#[serde(default)] pub metrics_steps_enabled: bool,   // default false
```

### 5.4 New TS files

| File                                 | Purpose                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| `src/MetricsTooltip.tsx`             | The tooltip window (route `#/metrics`)                               |
| `src/ActivityWindow.tsx`             | Activity / history view (route `#/activity`)                         |
| `src/AboutWindow.tsx`                | About panel (route `#/about`)                                        |
| `src/components/HeatmapCalendar.tsx` | GitHub-style yearly grid (52 cols × 7 rows)                          |
| `src/hooks/usePetSteps.ts`           | Subscribes to `usePetMovement` deltas → calls `record_pet_steps` IPC |
| `src/store/metricsStore.ts`          | Zustand store: live counts, period selector, refresh interval        |

`src/main.tsx` — extend the existing route switch to include `#/metrics`, `#/activity`, `#/about`.

### 5.5 House menu wiring

Modify `HouseWindow.tsx`:

- Add `onContextMenu` handler that calls a new Tauri command `show_house_menu(x, y)`.
- The Rust command builds a `tauri::menu::Menu` with the items above and shows it via `window.show_menu()` at the cursor position.
- Menu events route through the existing tray-event handler pattern in `lib.rs`. Reuse `tray-select-pet`, `tray-settings`, etc.; add new events `metrics-toggle-input`, `metrics-toggle-steps`, `open-activity`, `open-about`.

### 5.6 Capabilities — `src-tauri/capabilities/default.json`

Add the two new windows to the `windows` array: `["main", "panel", "house", "metrics", "activity"]`. (`about` reuses the `panel` window.)

Also add `core:menu:default` if not already present, so the house can show context menus.

---

## 6. Data flow

```
[OS] ─key/mouse─► [input_monitor thread] ─AtomicU64++ ─► every 5s ─►
                                                                    [metrics.rs aggregator]
[App] ─pet step─► record_pet_steps IPC ───────────────────────────►
                                                                    │
                                                                    ▼
                                                          storage::increment_metrics_today
                                                                    │
                                                                    ▼
                                                              metrics_daily (SQLite)
                                                                    │
                                                                    ▼
[MetricsTooltip] polls get_metrics(period) every 1s ◄───────────────┘
[ActivityWindow] calls get_metrics_history on mount + on period change
```

Reactive paws path (separate, not persisted):

```
[input_monitor] ─emit("nekometrics:key")─► [App.tsx listener] ─dispatch on_keystroke trigger─► [usePetAnimation]
```

---

## 7. Step definition (recommended option B)

The pet's animation engine in `src/hooks/usePetAnimation.ts` advances frames on a fixed tick. When the active animation is a `walk_*` variant, count one **step** every time the animation completes a full cycle (i.e. frame index wraps from `frames.length - 1` back to `0`). This corresponds to one full leg cycle and is the most readable definition for the user.

Implementation sketch:

```ts
// in usePetAnimation.ts (pseudo)
const prevFrame = useRef(0)
useEffect(() => {
  const isWalking = currentClip.startsWith('walk_')
  if (isWalking && prevFrame.current === frames.length - 1 && frame === 0) {
    incrementPetStep() // calls invoke('record_pet_steps', { steps: 1 })
  }
  prevFrame.current = frame
}, [frame, currentClip])
```

Batch on the JS side too (e.g. flush every 2 s) to avoid IPC chatter.

---

## 8. UI states & edge cases

- **First run, both toggles off** — tooltip window stays hidden, house menu shows both items unchecked.
- **Toggle keystrokes on while typing** — counter starts from 0 _for the current second_, but reads the day total from SQLite (so `Today` doesn't appear empty if there was a previous session).
- **App restart mid-day** — `metrics_daily` row for today is preserved; the counter resumes accumulating.
- **Day rollover at midnight** — aggregator detects the date change and creates a new row. The tooltip's "Today" automatically reads the new row.
- **Sleep / lock** — input hooks pause naturally; nothing to do.
- **Multiple monitors / DPI changes** — the tooltip repositions on `tauri-runtime` `Moved`/`ScaleFactorChanged` events of the `house` window.
- **User disables a counter** — stop emitting reactive-paws events for that channel, hide its row in the tooltip, but **keep historical data** (do not delete rows).
- **macOS Accessibility permission missing** — show a one-time toast directing the user to System Settings; gracefully fall back to "input metrics unavailable on this system" message in the tooltip.

---

## 9. Performance targets

- Input hook overhead: < 0.1 % CPU at idle, < 1 % during a 200 wpm typing burst.
- Tooltip polls `get_metrics('today')` at 1 Hz → SQLite single-row read, negligible.
- Aggregator writes at 0.2 Hz → at most one `UPDATE` per 5 s.
- Reactive-paws IPC events throttled to 16 Hz (60 ms) on the Rust side.

---

## 10. Testing checklist

Manual (no automated framework yet for IPC):

- [ ] Type 100 keys → `metrics_daily` shows `keystrokes >= 100` after 5 s.
- [ ] Click 20 times → `mouse_clicks >= 20` after 5 s.
- [ ] Walk pet across screen → step count increments every full leg cycle.
- [ ] Toggle off → counters freeze, but tooltip still reads the stored `Today` total.
- [ ] Toggle on after a restart → today's count picks up where it left off.
- [ ] Right-click house with both toggles off → no tooltip visible, menu items unchecked.
- [ ] Switch period to "This week" → tooltip shows sum of last 7 days.
- [ ] Activity window — heatmap shows correct intensity for past dates.
- [ ] Reactive paw animation — visible only on `classic-neko`, not on others (until they opt in).
- [ ] No outbound network traffic (verify with Wireshark or `netstat`).

Lint & type-check (must pass before commit):

```bash
npm run lint
npm run typecheck
npm run format:check
cd src-tauri && cargo clippy -- -D warnings && cd ..
```

---

## 11. Stretch / nice-to-have (not required for v0.3 ship)

- **Streaks** — "🔥 5-day typing streak". Compute from `metrics_daily` on tooltip open.
- **Achievements** — toast at 1k / 10k / 100k / 1M keystrokes, e.g. "Centurion", "Marathoner".
- **Productivity score** — combine keystroke rate with active app category (already known via `desktop_monitor`).
- **CSV export** — button in Activity window: `Export → metrics-YYYY-MM-DD.csv`.
- **Discord rich presence** — opt-in, "Naudy is being productive 🐾".
- **Activity sparkline** — tiny 24h sparkline above the daily count in the tooltip.

Mark each stretch item explicitly as "deferred to v0.4" in the PR description if not implemented.

---

## 12. Branch / commit / PR conventions

- Branch name: `feat/nekometrics-v0.3`.
- Conventional Commits, e.g.:
  - `feat(metrics): add input_monitor module with global hooks`
  - `feat(metrics): SQLite metrics_daily table + aggregator`
  - `feat(house): right-click context menu with metric toggles`
  - `feat(metrics): animated tooltip window with period selector`
  - `feat(metrics): activity window with weekly bar chart and heatmap`
  - `feat(pets): on_keystroke / on_click reactive triggers`
  - `docs: document NekoMetrics in README + creating-a-pet.md`
- PR title: `feat: NekoMetrics — anonymous activity counters and reactive paws (v0.3)`
- PR body: copy §1 + the testing checklist; list stretch items deferred.
- Bump app version: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` → `0.3.0`. Update the tray menu's "About" string in `lib.rs`.

---

## 13. Files expected to change

```
README.md                                         # already updated
docs/feature-nekometrics-v0.3.md                  # this file
docs/creating-a-pet.md                            # add on_keystroke / on_click triggers
schemas/pet.schema.json                           # add reactive_paws + new triggers

src-tauri/Cargo.toml                              # add rdev (or alt) + tokio if needed
src-tauri/capabilities/default.json               # add metrics, activity windows
src-tauri/tauri.conf.json                         # declare metrics + activity window configs
src-tauri/src/lib.rs                              # register commands, house menu, route handlers
src-tauri/src/storage.rs                          # metrics_daily table + helpers + AIConfig fields
src-tauri/src/input_monitor.rs                    # NEW
src-tauri/src/metrics.rs                          # NEW

src/main.tsx                                      # add /metrics, /activity, /about routes
src/MetricsTooltip.tsx                            # NEW
src/ActivityWindow.tsx                            # NEW
src/AboutWindow.tsx                               # NEW
src/HouseWindow.tsx                               # onContextMenu handler
src/components/HeatmapCalendar.tsx                # NEW
src/hooks/usePetSteps.ts                          # NEW
src/hooks/usePetAnimation.ts                      # emit step on walk-cycle wrap
src/store/configStore.ts                          # surface new toggles
src/store/metricsStore.ts                         # NEW

pets/classic-neko/pet.json                        # opt-in reactive_paws + on_keystroke clip
pets/classic-neko/sprites/                        # add paw_tap.png frame
```

---

## 14. Definition of done

- All checkboxes in §10 pass on Windows (primary target) and at least best-effort on Linux/macOS.
- No regressions in existing pet movement, AI chat, or house-window behavior.
- Tooltip animations feel smooth at 60 fps on a low-end laptop (< 1 % CPU at idle).
- Privacy: confirmed via code review that no key codes, mouse coordinates, or window contents are persisted or transmitted anywhere.
- README, CLAUDE.md, and `docs/creating-a-pet.md` reflect the new feature surface.
