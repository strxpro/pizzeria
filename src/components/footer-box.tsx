"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { PizzaBox } from "./pizza-box";
import { useScrollSpring } from "@/lib/scroll-spring";

/**
 * Zamknięte pudełko w stopce: wlatuje pod kątem, gdy stopka wjeżdża na ekran,
 * i zostaje z rogiem wystającym ponad krawędź stopki.
 */
export function FooterBox({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center 0.7"] });
  const p = useScrollSpring(scrollYProgress, { stiffness: 130, damping: 24 }, 0.12);

  const y = useTransform(p, [0, 1], [-55, 0]);
  const rz = useTransform(p, [0, 1], [-80, -28]);
  const rx = useTransform(p, [0, 1], [20, 52]);
  const transform = useMotionTemplate`translateY(${y}%) rotateX(${rx}deg) rotateY(-10deg) rotateZ(${rz}deg)`;
  const still = useMotionTemplate`rotateX(52deg) rotateY(-10deg) rotateZ(-28deg)`;
  const lid = useMotionValue(0);

  return (
    <div ref={ref} aria-hidden className={`pointer-events-none [perspective:1400px] ${className}`}>
      <motion.div
        className="[--h:calc(var(--w)*0.14)] [--w:min(78vw,30rem)] [transform-style:preserve-3d]"
        animate={reduced ? undefined : { y: [0, -12, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <PizzaBox transform={reduced ? still : transform} lid={lid} />
      </motion.div>
    </div>
  );
}
