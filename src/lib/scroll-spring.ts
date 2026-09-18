"use client";

import { useMotionValueEvent, useSpring, type MotionValue, type SpringOptions } from "motion/react";

/**
 * Sprężyna podpięta pod przewijanie, odporna na szybkie ruchy.
 *
 * Zwykła sprężyna dogania wartość z opóźnieniem: przy szybkim przewijaniu (albo skoku do sekcji)
 * animacja zostaje daleko w tyle i potem nadrabia jednym susem — to właśnie widać jako „przeskok”.
 * Gdy różnica przekracza `snap`, przestawiamy sprężynę od razu na właściwą wartość: obraz jest
 * zawsze zgodny z miejscem, w którym stoi strona, a przy spokojnym przewijaniu nadal płynie miękko.
 */
export function useScrollSpring(source: MotionValue<number>, config: SpringOptions, snap: number) {
  const spring = useSpring(source, config);
  useMotionValueEvent(source, "change", (v) => {
    if (Math.abs(v - spring.get()) > snap) spring.jump(v);
  });
  return spring;
}
