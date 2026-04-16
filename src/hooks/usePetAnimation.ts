import { useState, useEffect, useRef } from "react";
import type { AnimationDef } from "../pets";

export function usePetAnimation(animation: AnimationDef | null) {
  const [frameIndex, setFrameIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!animation) return;

    const { frames, fps, loop } = animation;
    let current = 0;

    intervalRef.current = setInterval(() => {
      current++;
      if (current >= frames.length) {
        if (loop) {
          current = 0;
        } else {
          clearInterval(intervalRef.current!);
          return;
        }
      }
      setFrameIndex(frames[current]);
    }, 1000 / fps);

    setFrameIndex(frames[0]);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [animation]);

  return frameIndex;
}
