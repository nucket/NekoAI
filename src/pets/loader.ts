import type {
  PetDefinition,
  AnimationConfig,
  SpriteConfig,
  TriggerMap,
  LoadedPet,
} from "../types/pet";

// ─── Validation error ─────────────────────────────────────────────────────────

/** Thrown when a pet.json fails schema validation */
export class PetValidationError extends Error {
  constructor(
    message: string,
    /** Dot-path to the field that failed (e.g. "animations.idle.fps") */
    public readonly field?: string
  ) {
    super(message);
    this.name = "PetValidationError";
  }
}

// ─── Validation helpers ───────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

function asObj(parent: Obj, key: string): Obj {
  const v = parent[key];
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new PetValidationError(`"${key}" must be an object`, key);
  }
  return v as Obj;
}

function asStr(parent: Obj, key: string, path = key): string {
  const v = parent[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new PetValidationError(`"${path}" must be a non-empty string`, path);
  }
  return v;
}

function asPositiveNumber(parent: Obj, key: string, path = key): number {
  const v = parent[key];
  if (typeof v !== "number" || v <= 0 || !isFinite(v)) {
    throw new PetValidationError(`"${path}" must be a positive number`, path);
  }
  return v;
}

// ─── Sub-validators ───────────────────────────────────────────────────────────

function validateSprite(data: Obj): SpriteConfig {
  const sprite = asObj(data, "sprite");
  return {
    path:        asStr(sprite, "path",        "sprite.path"),
    frameWidth:  asPositiveNumber(sprite, "frameWidth",  "sprite.frameWidth"),
    frameHeight: asPositiveNumber(sprite, "frameHeight", "sprite.frameHeight"),
  };
}

function validateAnimation(raw: unknown, path: string): AnimationConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new PetValidationError(`"${path}" must be an object`, path);
  }
  const obj = raw as Obj;

  if (!Array.isArray(obj.frames) || obj.frames.length === 0) {
    throw new PetValidationError(
      `"${path}.frames" must be a non-empty array of frame indices`,
      `${path}.frames`
    );
  }
  for (const f of obj.frames) {
    if (typeof f !== "number" || f < 0 || !Number.isInteger(f)) {
      throw new PetValidationError(
        `"${path}.frames" may only contain non-negative integers`,
        `${path}.frames`
      );
    }
  }

  const result: AnimationConfig = {
    frames: obj.frames as number[],
    fps:    asPositiveNumber(obj, "fps",  `${path}.fps`),
    loop:   (() => {
      if (typeof obj.loop !== "boolean") {
        throw new PetValidationError(`"${path}.loop" must be a boolean`, `${path}.loop`);
      }
      return obj.loop;
    })(),
  };

  if (typeof obj.next === "string" && obj.next.trim() !== "") {
    result.next = obj.next;
  }

  return result;
}

function validateAnimations(data: Obj): Record<string, AnimationConfig> {
  const raw = data.animations;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PetValidationError('"animations" must be an object', "animations");
  }

  const animations: Record<string, AnimationConfig> = {};
  for (const [key, val] of Object.entries(raw as Obj)) {
    animations[key] = validateAnimation(val, `animations.${key}`);
  }

  if (!("idle" in animations)) {
    throw new PetValidationError(
      'Pet must define at least an "idle" animation',
      "animations.idle"
    );
  }

  return animations;
}

function validateTriggers(data: Obj): TriggerMap {
  if (!("triggers" in data)) return {};

  const raw = data.triggers;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PetValidationError('"triggers" must be an object', "triggers");
  }

  const triggers: TriggerMap = {};
  for (const [event, animName] of Object.entries(raw as Obj)) {
    if (typeof animName !== "string") {
      throw new PetValidationError(
        `"triggers.${event}" must be an animation name string`,
        `triggers.${event}`
      );
    }
    triggers[event] = animName;
  }
  return triggers;
}

// ─── Public validator ─────────────────────────────────────────────────────────

/**
 * Validates a parsed JSON object against the PetDefinition schema.
 * Throws `PetValidationError` with a descriptive message and field path
 * on any schema violation.
 */
export function validatePetDefinition(data: unknown): PetDefinition {
  if (typeof data !== "object" || data === null) {
    throw new PetValidationError("Pet definition must be a JSON object");
  }
  const obj = data as Obj;

  const pet: PetDefinition = {
    id:         asStr(obj, "id"),
    name:       asStr(obj, "name"),
    author:     asStr(obj, "author"),
    version:    asStr(obj, "version"),
    sprite:     validateSprite(obj),
    animations: validateAnimations(obj),
    triggers:   validateTriggers(obj),
  };

  if (typeof obj.description     === "string") pet.description     = obj.description;
  if (typeof obj.defaultAnimation === "string") pet.defaultAnimation = obj.defaultAnimation;

  return pet;
}

// ─── File reader (Tauri fs API with browser fetch fallback) ───────────────────

/**
 * Reads a text file from disk.
 *
 * - Inside a Tauri window: uses `@tauri-apps/plugin-fs` `readTextFile()`
 * - In a plain browser dev session (no Tauri runtime): falls back to `fetch()`
 */
async function readFile(path: string): Promise<string> {
  if (typeof window !== "undefined" && "__TAURI__" in window) {
    // Dynamic import keeps the bundle tree-shakeable in browser-only builds
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    return readTextFile(path);
  }

  // Browser / Vite dev server fallback
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching "${path}"`);
  }
  return res.text();
}

/**
 * Converts a local filesystem path to a URL that Tauri's webview can load
 * (asset:// scheme on desktop). Falls back to a file:// URL in the browser.
 */
async function toAssetUrl(absPath: string): Promise<string> {
  if (typeof window !== "undefined" && "__TAURI__" in window) {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    return convertFileSrc(absPath);
  }
  // In a plain browser just return the path as-is (works for relative paths
  // served by Vite from the project root)
  return absPath;
}

// ─── Public loader ────────────────────────────────────────────────────────────

/**
 * Loads and validates a pet.json file from disk.
 *
 * Resolves the sprite sheet URL relative to the directory that
 * contains the pet.json file.
 *
 * @param petJsonPath Absolute path (or Vite-relative URL) to the pet.json file
 */
export async function loadPetFromPath(petJsonPath: string): Promise<LoadedPet> {
  // ── Read raw text ─────────────────────────────────────────────────────────
  let content: string;
  try {
    content = await readFile(petJsonPath);
  } catch (cause) {
    throw new Error(
      `Failed to read pet file at "${petJsonPath}": ${cause}`
    );
  }

  // ── Parse JSON ────────────────────────────────────────────────────────────
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new PetValidationError(`"${petJsonPath}" contains invalid JSON`);
  }

  // ── Validate schema ───────────────────────────────────────────────────────
  const definition = validatePetDefinition(data);

  // ── Resolve paths ─────────────────────────────────────────────────────────
  // Strip the filename, keep the directory.
  const basePath = petJsonPath.replace(/[/\\][^/\\]+$/, "");
  const rawSpritePath = `${basePath}/${definition.sprite.path}`;
  const spritesheetUrl = await toAssetUrl(rawSpritePath);

  return { ...definition, basePath, spritesheetUrl };
}
