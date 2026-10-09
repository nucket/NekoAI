# Creating a Pet for NekoAI

This guide explains how to create a new pet for NekoAI — from the folder structure and `pet.json` format to adding it to the registry.

---

## Folder structure

Each pet lives in its own directory inside `pets/`:

```
pets/
└── my-dragon/
    ├── pet.json        ← required: metadata, personality, animations
    └── sprites/        ← required: one PNG per animation frame
        ├── idle1.png
        ├── idle2.png
        ├── walk_right1.png
        └── ...
```

The folder name is the pet's **ID** — it must be kebab-case and unique.

---

## `pet.json` reference

```jsonc
{
  // ── Identity ────────────────────────────────────────────────────────────────
  "name": "Ember", // Display name shown in the UI
  "version": "1.0.0", // Semver
  "author": "yourname",
  "description": "A tiny fire dragon who loves dark mode",

  // ── AI personality ──────────────────────────────────────────────────────────
  "personality": "Ember is snarky, warm-hearted, and obsessed with coffee.",
  // Persona only — reply length and "no markdown" are appended by the app from
  // the user's Settings → Response length choice, so don't hard-code them here.
  "system_prompt": "You are Ember, a tiny fire dragon living on the user's desktop. You are witty, slightly dramatic, and love punchy one-liners.",

  // ── Sprites ─────────────────────────────────────────────────────────────────
  "spritesDir": "sprites", // subfolder containing frame PNGs

  // ── Animations ──────────────────────────────────────────────────────────────
  // Each animation is a sequence of PNG files played at a given fps.
  // Files are listed in playback order. "loop: false" stays on the last frame.
  "animations": {
    "idle": {
      "files": ["idle1.png", "idle2.png"],
      "fps": 3,
      "loop": true,
    },
    "walk_right": {
      "files": ["right1.png", "right2.png", "right3.png", "right4.png"],
      "fps": 10,
      "loop": true,
    },
    "walk_left": { "files": ["left1.png", "left2.png"], "fps": 10, "loop": true },
    "walk_up": { "files": ["up1.png", "up2.png"], "fps": 8, "loop": true },
    "walk_down": { "files": ["down1.png", "down2.png"], "fps": 8, "loop": true },
    "walk_up_right": { "files": ["upright1.png", "upright2.png"], "fps": 8, "loop": true },
    "walk_up_left": { "files": ["upleft1.png", "upleft2.png"], "fps": 8, "loop": true },
    "walk_down_right": { "files": ["downright1.png", "downright2.png"], "fps": 8, "loop": true },
    "walk_down_left": { "files": ["downleft1.png", "downleft2.png"], "fps": 8, "loop": true },
    "happy": { "files": ["happy1.png", "happy2.png"], "fps": 8, "loop": false },
    "sleep": { "files": ["sleep1.png", "sleep2.png"], "fps": 2, "loop": true },
    "yawn": { "files": ["yawn1.png", "yawn2.png"], "fps": 3, "loop": false },
    "awaken": { "files": ["awake.png"], "fps": 6, "loop": false },
    "falling_asleep": { "files": ["fall1.png", "fall2.png", "fall3.png"], "fps": 4, "loop": false },
  },

  // ── Triggers ────────────────────────────────────────────────────────────────
  // Map system events to animation names. All optional.
  "triggers": {
    "on_cursor_near": "happy", // cursor enters pet's proximity
    "on_chat_open": "awaken", // user opens the chat bubble
    "on_idle_3min": "yawn", // OS idle >= 3 minutes
    "on_idle_5min": "falling_asleep", // OS idle >= 5 minutes
    "on_idle_6min": "sleep", // OS idle >= 6 minutes
    "on_movement_start": "awaken", // pet starts moving
  },
}
```

### Triggers

Every trigger is optional, and a trigger that points at an animation your pet doesn't define is ignored. While the pet is walking, only the edge-hit scratch can replace the walk animation.

| Trigger                                 | When it fires                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `on_cursor_near`                        | Once, when the pet settles next to the cursor (after a short pause, before grooming)                                                       |
| `on_chat_open`                          | The user clicks the pet to open the chat bubble                                                                                            |
| `on_ai_thinking`                        | Held while the AI request is in flight                                                                                                     |
| `on_ai_response`                        | The AI reply arrives (not on errors)                                                                                                       |
| `on_idle_3min` / `5min` / `6min`        | The OS has been idle (no keyboard or mouse) that long. A looping animation (e.g. `sleep`) is held until the user is back; others play once |
| `on_movement_start`                     | The pet starts moving after a real rest. Defaults to `awaken` when unmapped                                                                |
| `on_edge_hit_*`                         | The pet runs into a screen edge (`right`, `left`, `up`, `down`)                                                                            |
| `on_happy`, `on_surprised`, `on_eating` | Reserved, not fired by the app yet                                                                                                         |

One-shot triggers play one pass of the animation (frames ÷ fps), clamped to 0.4–2 s.

### How `system_prompt` is used

`system_prompt` becomes the start of the AI's system prompt whenever your pet is active. NekoAI then appends what the user has taught the pet (name, project…), the pet's current mood, and a reply-length instruction matching **Settings → Response length** (S / M / L). Describe who the pet _is_ — voice, quirks, catchphrases — and leave length and formatting to the app.

### Required animations

The only mandatory animation is **`idle`**. The engine falls back to `idle` when a requested animation is missing, so you can ship a minimal pet and add animations incrementally.

### Recommended animation set

For a polished pet, implement all 8 walk directions plus `idle`, `happy`, `sleep`, `yawn`, `awaken`, and `falling_asleep`. The mood engine uses `yawn`, `falling_asleep`, and `sleep` automatically based on OS idle time.

---

## Sprite specifications

| Property   | Recommendation                                      |
| ---------- | --------------------------------------------------- |
| Format     | PNG with transparency (RGBA)                        |
| Frame size | 32×32 px or 48×48 px (consistent within a pet)      |
| Style      | Pixel art — use `image-rendering: pixelated` in CSS |
| Background | Transparent                                         |

The engine renders sprites at 2× scale by default (`displaySize` prop on `PetRenderer`). A 32px sprite appears as 64px on screen.

---

## Registering your pet

### 1. Add to `pets/manifest.json`

```json
{
  "id": "my-dragon",
  "name": "Ember",
  "description": "A tiny fire dragon who loves dark mode",
  "emoji": "🔥",
  "author": "yourname"
}
```

### 2. Add to the tray menu (Rust)

In `src-tauri/src/lib.rs`, add a `MenuItem` and a handler inside `setup`:

```rust
// In the setup block:
let pet_dragon = MenuItem::with_id(app, "pet_dragon", "Ember", true, None::<&str>)?;
let select_pet  = Submenu::with_items(app, "Select Pet", true, &[
    &pet_classic, &pet_ghost, &pet_shiba, &pet_dragon
])?;

// In on_menu_event:
"pet_dragon" => {
    show_window(app);
    app.emit("tray-select-pet", "my-dragon").ok();
}
```

After these two steps the pet appears in both the in-app selector (PetSelector reads `manifest.json`) and the system tray.

---

## Testing your pet

```bash
cd NekoAI
pnpm pets:validate   # checks every manifest pet: required fields + animations, sprite files, triggers
pnpm tauri dev
```

`pets:validate` also runs in CI. A pet listed in `manifest.json` appears in both the pet selector and the tray's **Select Pet** menu, so every sprite it references must exist.

1. Right-click the pet → open the selector
2. Choose your new pet
3. Verify animations play and the AI responds with the correct personality

If a sprite file is missing, `PetRenderer` silently renders a transparent placeholder for that frame — check the browser console for 404 errors.

---

## Sharing your pet

Submit a PR adding your pet folder to `pets-community/`. Include:

```
pets-community/
└── my-dragon/
    ├── pet.json
    ├── sprites/         ← all PNG frames
    └── README.md        ← description, credits, license
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for full guidelines.
