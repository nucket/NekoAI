# Creating a Pet for NekoAI

This guide explains how to create a new pet for NekoAI — from the folder structure and `pet.json` format to adding it to the registry.

---

## Folder structure

Each pet lives in its own directory inside `pets/`:

```
pets/
└── my-dragon/
    ├── pet.json        ← required: metadata, personality, animations
    ├── sprites/        ← required: one PNG per animation frame
    │   ├── idle1.png
    │   ├── idle2.png
    │   ├── walk_right1.png
    │   └── ...
    └── README.md       ← description, credits, sprite license
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

`system_prompt` becomes the start of the AI's system prompt whenever your pet is active. NekoAI then appends what the user has taught the pet (name, project…), the pet's current mood, and a reply-length instruction matching **Settings → Response length** (Short / Medium / Long). Describe who the pet _is_ — voice, quirks, catchphrases — and leave length and formatting to the app.

### Required animations

Four animations are mandatory: **`idle`**, **`walk_right`**, **`walk_left`** and **`sleep`** (`pnpm pets:validate` checks them against `schemas/pet.schema.json`, which also lists the required top-level fields). For anything else the engine falls back to `idle`, so you can ship a minimal pet and add animations incrementally.

### Recommended animation set

For a polished pet, implement all 8 walk directions plus `idle`, `happy`, `sleep`, `yawn`, `awaken`, and `falling_asleep`. The mood engine uses `yawn`, `falling_asleep`, and `sleep` automatically based on OS idle time.

---

## Sprite specifications

| Property   | Recommendation               |
| ---------- | ---------------------------- |
| Format     | PNG with transparency (RGBA) |
| Frame size | 32×32 px                     |
| Style      | Pixel art                    |
| Background | Transparent                  |

The user picks the on-screen size in the context menu: S = 32 px (the default), M = 64, L = 96 or XL = 128. These are whole multiples of 32, so a 32×32 sprite stays crisp at every size; other frame sizes get scaled by fractions and look blurry or uneven.

---

## Registering your pet

Add an entry to the `pets` array in `pets/manifest.json`:

```json
{
  "id": "my-dragon",
  "name": "Ember",
  "description": "A tiny fire dragon who loves dark mode",
  "emoji": "🔥",
  "author": "yourname",
  "bundled": true
}
```

`id` must match the folder name. That's all: the in-app selector and the tray's **Select Pet** menu both read this file, so no code changes are needed.

---

## Testing your pet

```bash
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

Open a PR that adds your `pets/<id>/` folder (with its `README.md`) and the `pets/manifest.json` entry, and attach a screenshot or GIF of the pet in action. CI runs `pnpm pets:validate` on every PR. Once merged, the pet ships in the next release.

Only submit sprites you made yourself or that are under a license allowing redistribution. Characters that belong to someone else (trademarked or copyrighted) are not accepted.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for full guidelines.
