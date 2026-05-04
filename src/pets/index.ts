// Re-export everything from the canonical types module so that
// any import from "@/pets" continues to work without path changes.
export type {
  PetDefinition,
  LoadedPet,
  AnimationConfig,
  AnimationName,
  BuiltinAnimationName,
  SpriteConfig,
  TriggerEvent,
  TriggerMap,
  PetMood,
} from '../types/pet'

export { PetRenderer } from './PetRenderer'
export type { PetRendererProps } from './PetRenderer'

export { loadPetFromPath, validatePetDefinition, PetValidationError } from './loader'

export {
  generatePlaceholderSpritesheet,
  PLACEHOLDER_ANIMATIONS,
  ANIMATION_CYCLE,
} from './placeholderSprite'
