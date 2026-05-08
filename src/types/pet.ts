// ─── Animations ──────────────────────────────────────────────────────────────

/**
 * A single animation clip — an ordered list of PNG frames inside the pet's
 * sprites directory. Mirrors `definitions.animation` in
 * `schemas/pet.schema.json` exactly: each frame is a separate file on disk.
 */
export interface AnimationConfig {
  /** Ordered list of sprite filenames (relative to spritesDir). One file per frame. */
  files: string[]
  /** Playback speed in frames per second (1–60). */
  fps: number
  /** Whether the animation loops (true) or plays once (false). */
  loop: boolean
}

/** Well-known animation names a pet may declare. Open union — custom names allowed. */
export type AnimationName =
  | 'idle'
  | 'walk_right'
  | 'walk_left'
  | 'walk_up'
  | 'walk_down'
  | 'walk_up_right'
  | 'walk_up_left'
  | 'walk_down_right'
  | 'walk_down_left'
  | 'awaken'
  | 'yawn'
  | 'falling_asleep'
  | 'sleep'
  | 'happy'
  | 'thinking'
  | 'surprised'
  | 'eating'
  | 'wash'
  | 'scratch_wall'
  | 'scratch_right'
  | 'scratch_left'
  | 'scratch_up'
  | 'scratch_down'
  | (string & {})

// ─── Triggers ────────────────────────────────────────────────────────────────

/** System / interaction events that can map to an animation. Mirrors the schema. */
export type TriggerEvent =
  | 'on_cursor_near'
  | 'on_chat_open'
  | 'on_ai_thinking'
  | 'on_ai_response'
  | 'on_idle_3min'
  | 'on_idle_5min'
  | 'on_idle_6min'
  | 'on_movement_start'
  | 'on_happy'
  | 'on_surprised'
  | 'on_eating'
  | 'on_edge_hit_right'
  | 'on_edge_hit_left'
  | 'on_edge_hit_up'
  | 'on_edge_hit_down'

/** Maps trigger events to animation names. */
export type TriggerMap = Partial<Record<TriggerEvent, AnimationName>>

// ─── Pet Definition ──────────────────────────────────────────────────────────

/** Full pet definition as stored on disk in pet.json (validated by pet.schema.json). */
export interface PetDefinition {
  /** Display name shown in the UI. */
  name: string
  /** Semantic version of this pet definition (e.g. "1.0.0"). */
  version: string
  /** Author / creator handle. */
  author: string
  /** One-line description shown in the pet selector. */
  description: string
  /** Human-readable personality summary (kept for contributor reference). */
  personality: string
  /** Prompt sent to the AI to define the pet's voice. */
  system_prompt: string
  /** Path to the sprites directory, relative to pet.json. Almost always "sprites". */
  spritesDir: string
  /**
   * Animation map keyed by name. The schema requires at least
   * `idle`, `walk_right`, `walk_left`, `sleep`, but custom names are also
   * allowed, so this stays an open record.
   */
  animations: Record<string, AnimationConfig>
  /** Optional event → animation mappings. */
  triggers: TriggerMap
}

// ─── Mood (used by the mood engine and AI context) ───────────────────────────

/** Runtime emotional state of the active pet. */
export interface PetMood {
  /** 0-100: how energetic the pet currently feels. */
  energy: number
  /** 0-100: happiness level — affects idle animation variant. */
  happiness: number
  /** 0-100: how curious / attention-seeking the pet is. */
  curiosity: number
}
