import { CSSProperties } from "react";

interface PetSpriteProps {
  spriteSheet: string;
  frameWidth: number;
  frameHeight: number;
  frameIndex: number;
  scale?: number;
  style?: CSSProperties;
}

export function PetSprite({
  spriteSheet,
  frameWidth,
  frameHeight,
  frameIndex,
  scale = 2,
  style,
}: PetSpriteProps) {
  const offsetX = -(frameIndex * frameWidth);

  return (
    <div
      style={{
        width: frameWidth * scale,
        height: frameHeight * scale,
        backgroundImage: `url(${spriteSheet})`,
        backgroundPosition: `${offsetX * scale}px 0`,
        backgroundSize: `auto ${frameHeight * scale}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
        ...style,
      }}
    />
  );
}
