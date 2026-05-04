// ─── Sprite ──────────────────────────────────────────────────────────────────

/** Configuration for the PNG sprite sheet */
export interface SpriteConfig {
  /** Path to the PNG file, relative to the pet's base directory */
  path: string
  /** Width of each individual frame in pixels */
  frameWidth: number
  /** Height of each individual frame in pixels */
  frameHeight: number
}

// ─── Animations ──────────────────────────────────────────────────────────────

/** A single animation sequence defined by frame indices into the sprite sheet */
export interface AnimationConfig {
  /**
   * Frame indices from the sprite sheet, 0-based, ordered left-to-right.
   * e.g. [0, 1, 2] plays frames at x=0, x=frameWidth, x=frameWidth*2
   */
  frames: number[]
  /** Playback speed in frames per second */
  fps: number
  /** Whether the animation loops back to the first frame when it ends */
  loop: boolean
  /**
   * Name of the animation to transition to automatically when this one ends.
   * Only meaningful when loop=false. Defaults to "idle" if omitted.
   */
  next?: string
}

/** Well-known animation names — a valid pet must implement at least "idle" */
export type BuiltinAnimationName =
  | 'idle'
  | 'walk'
  | 'walk_right'
  | 'walk_left'
  | 'run'
  | 'happy'
  | 'thinking'
  | 'sleep'
  | 'scratch'
  | 'yawn'
  | 'alert'

export type AnimationName = BuiltinAnimationName | string

// ─── Triggers ────────────────────────────────────────────────────────────────

/**
 * System or interaction events that can trigger an animation change.
 * Custom events can be added as plain strings.
 */
export type TriggerEvent =
  | 'onIdle' // user hasn't moved the mouse for a while
  | 'onMouseNear' // cursor entered the pet's proximity radius
  | 'onMouseFar' // cursor left the proximity radius
  | 'onDragStart' // user started dragging the window
  | 'onDragEnd' // drag released
  | 'onDoubleClick' // double-click on the pet
  | 'onRightClick' // right-click on the pet
  | 'onSystemIdle' // OS idle (no keyboard/mouse input)
  | 'onHourChange' // wall-clock hour ticked over
  | 'onNight' // 20:00–07:00 local time
  | string

/** Maps trigger events to the animation that should play when they fire */
export type TriggerMap = Partial<Record<TriggerEvent, AnimationName>>

// ─── Pet Definition ──────────────────────────────────────────────────────────

/** Full pet definition as stored on disk in pet.json */
export interface PetDefinition {
  /** Unique identifier, kebab-case (e.g. "classic-neko") */
  id: string
  /** Human-readable display name */
  name: string
  /** Creator / maintainer */
  author: string
  /** Semver version string (e.g. "1.0.0") */
  version: string
  /** Optional description shown in the pet picker UI */
  description?: string
  /** Sprite sheet configuration */
  sprite: SpriteConfig
  /** All available animation sequences */
  animations: Record<AnimationName, AnimationConfig>
  /** Event → animation mappings (all optional) */
  triggers: TriggerMap
  /** Animation to play on app startup. Defaults to "idle". */
  defaultAnimation?: AnimationName
}

/**
 * PetDefinition enriched with resolved paths after being loaded from disk.
 * This is what the rest of the app works with at runtime.
 */
export interface LoadedPet extends PetDefinition {
  /** Absolute directory path that contained the pet.json */
  basePath: string
  /**
   * Fully resolved URL for the sprite sheet, ready to use as
   * HTMLImageElement.src or as a canvas drawImage source.
   * In Tauri this is an asset:// URL; in the browser it's a relative path.
   */
  spritesheetUrl: string
}

// ─── Mood (used by AI and store) ─────────────────────────────────────────────

/** Runtime emotional state of the active pet */
export interface PetMood {
  /** 0-100: how energetic the pet currently feels */
  energy: number
  /** 0-100: happiness level — affects idle animation variant */
  happiness: number
  /** 0-100: how curious / attention-seeking the pet is */
  curiosity: number
}
