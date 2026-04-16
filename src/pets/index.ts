// Pet definitions and loaders
// Each pet is a folder under /pets/<pet-id>/
// containing sprite sheets, animations, and metadata

export interface PetDefinition {
  id: string;
  name: string;
  author: string;
  version: string;
  spritePath: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, AnimationDef>;
}

export interface AnimationDef {
  frames: number[];
  fps: number;
  loop: boolean;
}
