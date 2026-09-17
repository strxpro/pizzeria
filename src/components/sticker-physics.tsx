"use client";

import type { Body as MatterBody, Constraint as MatterConstraint, Engine as MatterEngine } from "matter-js";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useT } from "@/lib/i18n/provider";

type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

/** Odstęp ścian od krawędzi sekcji — naklejki nie dotykają brzegu ekranu. */
const PAD = 10;
/** Stały krok symulacji (ms) — ten sam przy 60 i 120 Hz, bez drgań i przenikania. */
const STEP = 1000 / 120;
/** Grubość niewidocznych ścian. */
const WALL = 200;
const MAX_SPEED = 28;
/** Wzmocnienie przechyłu: lekkie pochylenie telefonu wyraźnie przesuwa naklejki. */
const TILT_GAIN = 2.4;
const TILT_MAX = 1.8;

/**
 * Naklejki z prawdziwą fizyką (matter-js, ładowany dopiero w tej sekcji):
 * - od razu leżą ułożone na dole sekcji (symulacja rusza chwilę przed wjazdem na ekran, bez spadania);
 * - złapane palcem idą za nim, rzucone lecą z rozpędem, odbijają się od siebie i ścian;
 * - przechylenie telefonu zmienia kierunek grawitacji (w prawo = naklejki w prawo), a potrząśnięcie je podrzuca.
 *   iPhone wymaga zgody na czujniki ruchu — wtedy pokazujemy przycisk.
 * Symulacja działa tylko, gdy sekcja jest widoczna; pozycje wpisujemy jako `transform`.
 */
export function StickerPhysics({ labels, tones, children, className = "" }: { labels: string[]; tones: string[]; children?: ReactNode; className?: string }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLLIElement | null)[]>([]);
  const engineRef = useRef<MatterEngine | null>(null);
  const bodies = useRef<MatterBody[]>([]);
  const grab = useRef<{ constraint: MatterConstraint; pointerId: number } | null>(null);
  const matter = useRef<typeof import("matter-js") | null>(null);
  const walls = useRef<MatterBody[]>([]);
  const [ready, setReady] = useState(false);
  const [motion, setMotion] = useState<"off" | "ask" | "on">("off");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let raf = 0;
    let visible = false;
    let started = false;
    let alive = true;
    let last = 0;

    const start = async () => {
      if (started) return;
      started = true;
      const M = (await import("matter-js")).default;
      if (!alive) return;
      matter.current = M;
      const { Engine, Bodies, Composite } = M;
      const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8, constraintIterations: 4 });
      engine.gravity.y = 1;
      engineRef.current = engine;

      const W = el.clientWidth;
      const H = el.clientHeight;
      walls.current = [
        Bodies.rectangle(W / 2, H - PAD + WALL / 2, W * 3, WALL, { isStatic: true, friction: 0.9 }),
        Bodies.rectangle(PAD - WALL / 2, H / 2, WALL, H * 4, { isStatic: true, friction: 0.2 }),
        Bodies.rectangle(W - PAD + WALL / 2, H / 2, WALL, H * 4, { isStatic: true, friction: 0.2 }),
        Bodies.rectangle(W / 2, PAD - WALL / 2, W * 3, WALL, { isStatic: true }),
      ];
      Composite.add(engine.world, walls.current);
      // elementy dekoracji oznaczone data-physics-obstacle (np. znak pizzerii) są okrągłymi przeszkodami
      const origin = el.getBoundingClientRect();
      el.querySelectorAll<HTMLElement>("[data-physics-obstacle]").forEach((o) => {
        const r = o.getBoundingClientRect();
        Composite.add(engine.world, Bodies.circle(r.left - origin.left + r.width / 2, r.top - origin.top + r.height / 2, (Math.min(r.width, r.height) / 2) * 0.92, { isStatic: true, friction: 0.4 }));
      });

      const sizes = els.current.map((node) => ({ w: node?.offsetWidth ?? 120, h: node?.offsetHeight ?? 48 }));
      // Układ startowy: rzędy od dołu sekcji, jak ułożone ręcznie (bez spadania z góry).
      const slots: { x: number; y: number }[] = [];
      let rowX = PAD + 6;
      let rowY = H - PAD;
      let rowH = 0;
      sizes.forEach(({ w, h }) => {
        if (rowX + w > W - PAD && rowX > PAD + 6) {
          rowY -= rowH + 4;
          rowX = PAD + 6;
          rowH = 0;
        }
        slots.push({ x: Math.min(W - PAD - w / 2, rowX + w / 2), y: rowY - h / 2 });
        rowX += w + 4;
        rowH = Math.max(rowH, h);
      });
      bodies.current = sizes.map(({ w, h }, i) => {
        const { x, y } = slots[i];
        const body = Bodies.rectangle(x, y, w, h, {
          chamfer: { radius: h / 2 - 1 },
          angle: (i % 2 ? 1 : -1) * 0.04,
          restitution: 0.18,
          friction: 0.45,
          frictionStatic: 0.8,
          frictionAir: 0.02,
          density: 0.0018,
          slop: 0.02,
        });
        return body;
      });
      Composite.add(engine.world, bodies.current);
      // Symulacja „na zapas” przed pokazaniem: naklejki od razu leżą spokojnie na miejscu.
      for (let s = 0; s < 240; s++) Engine.update(engine, STEP);
      bodies.current.forEach((b, i) => {
        const node = els.current[i];
        if (node) node.style.transform = `translate3d(${(b.position.x - sizes[i].w / 2).toFixed(1)}px, ${(b.position.y - sizes[i].h / 2).toFixed(1)}px, 0) rotate(${b.angle.toFixed(3)}rad)`;
      });
      setReady(true);

      let acc = 0;
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const dt = last ? Math.min(now - last, 50) : STEP;
        last = now;
        if (!visible) return;
        // stały krok: tyle kroków, ile zmieściło się od ostatniej klatki (najwyżej 6)
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 6) {
          Engine.update(engine, STEP);
          acc -= STEP;
          steps++;
        }
        if (steps === 6) acc = 0;
        // bez „wystrzeliwania” — prędkość ograniczona
        for (const b of bodies.current) {
          const v = b.velocity;
          const speed = Math.hypot(v.x, v.y);
          if (speed > MAX_SPEED) M.Body.setVelocity(b, { x: (v.x / speed) * MAX_SPEED, y: (v.y / speed) * MAX_SPEED });
        }
        bodies.current.forEach((b, i) => {
          const node = els.current[i];
          if (!node) return;
          node.style.transform = `translate3d(${(b.position.x - sizes[i].w / 2).toFixed(1)}px, ${(b.position.y - sizes[i].h / 2).toFixed(1)}px, 0) rotate(${b.angle.toFixed(3)}rad)`;
        });
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        last = 0;
        if (visible) start();
      },
      // start chwilę przed wjazdem na ekran — naklejki są już ułożone, gdy sekcja się pokaże
      { rootMargin: "0px 0px 300px 0px" },
    );
    io.observe(el);

    // Obrót telefonu zmienia szerokość sekcji — ściany jadą za nią, naklejki zostają w środku.
    let size = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const M = matter.current;
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!M || !walls.current.length || (Math.abs(W - size.w) < 2 && Math.abs(H - size.h) < 2)) return;
      size = { w: W, h: H };
      const [floor, left, right, top] = walls.current;
      M.Body.setPosition(floor, { x: W / 2, y: H - PAD + WALL / 2 });
      M.Body.setPosition(left, { x: PAD - WALL / 2, y: H / 2 });
      M.Body.setPosition(right, { x: W - PAD + WALL / 2, y: H / 2 });
      M.Body.setPosition(top, { x: W / 2, y: PAD - WALL / 2 });
      for (const b of bodies.current) {
        M.Sleeping.set(b, false);
        M.Body.setPosition(b, { x: Math.min(W - PAD - 40, Math.max(PAD + 40, b.position.x)), y: Math.min(H - PAD - 30, Math.max(PAD + 30, b.position.y)) });
      }
    });
    ro.observe(el);

    return () => {
      alive = false;
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
      if (engineRef.current && matter.current) matter.current.Engine.clear(engineRef.current);
      engineRef.current = null;
    };
  }, []);

  // Czujniki ruchu: Android od razu, iPhone po zgodzie (przycisk).
  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const needsPermission = typeof (DeviceOrientationEvent as unknown as OrientationPermission).requestPermission === "function";
    const id = setTimeout(() => setMotion(needsPermission ? "ask" : "on"), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (motion !== "on") return;
    const clamp = (v: number) => Math.max(-TILT_MAX, Math.min(TILT_MAX, v));

    // Przy włączonym przechyle naklejki ślizgają się łatwiej — reagują na małe pochylenie.
    const slippery = () => {
      for (const b of bodies.current) {
        b.friction = 0.08;
        b.frictionStatic = 0.1;
      }
    };
    slippery();

    // Kierunek bierzemy z wektora grawitacji czujnika, nie z kątów beta/gamma: kąty „wariują”,
    // gdy telefon stoi pionowo (wtedy przechył w bok to zupełnie inna oś).
    // Safari i Chrome podają ten wektor z przeciwnym znakiem — znak ustalamy sami: gdy telefon
    // jest wyraźnie pionowo (beta), grawitacja musi ciągnąć w dół ekranu.
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    let flip = apple ? -1 : 1;
    let calibrated = false;
    let beta: number | null = null;
    let gx = 0;
    let gy = 1;

    const onOrientation = (e: DeviceOrientationEvent) => {
      beta = e.beta;
    };

    const screenAngle = () => {
      const a = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
      return ((a % 360) + 360) % 360;
    };

    let lastShake = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const engine = engineRef.current;
      const M = matter.current;
      if (!engine || !M) return;
      if (!bodies.current.length) return;
      if (bodies.current[0].frictionStatic !== 0.1) slippery();

      const g = e.accelerationIncludingGravity;
      if (g && g.x !== null && g.y !== null) {
        if (!calibrated && beta !== null && Math.abs(g.y) > 4) {
          const s = Math.sin((beta * Math.PI) / 180);
          if (Math.abs(s) > 0.45) {
            flip = Math.sign(g.y) * Math.sign(s);
            calibrated = true;
          }
        }
        // grawitacja w układzie ekranu: x w prawo, y w dół (1 = pełne g)
        let dx = (-g.x * flip) / 9.81;
        let dy = (g.y * flip) / 9.81;
        const angle = screenAngle();
        if (angle === 90) [dx, dy] = [dy, -dx];
        else if (angle === 180) [dx, dy] = [-dx, -dy];
        else if (angle === 270) [dx, dy] = [-dy, dx];
        const tx = clamp(dx * TILT_GAIN);
        const ty = clamp(dy * TILT_GAIN);
        // lekkie wygładzenie — bez drżenia ręki, ale z natychmiastową reakcją
        gx += (tx - gx) * 0.35;
        gy += (ty - gy) * 0.35;
        if (Math.abs(gx - engine.gravity.x) + Math.abs(gy - engine.gravity.y) > 0.01) {
          for (const b of bodies.current) if (b.isSleeping) M.Sleeping.set(b, false);
        }
        engine.gravity.x = gx;
        engine.gravity.y = gy;
      }

      const a = e.acceleration;
      if (!a) return;
      const force = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      const now = Date.now();
      if (force < 14 || now - lastShake < 400) return;
      lastShake = now;
      bodies.current.forEach((b) => {
        M.Sleeping.set(b, false);
        M.Body.setVelocity(b, { x: (Math.random() - 0.5) * 18, y: -10 - Math.random() * 12 });
        M.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.4);
      });
    };

    window.addEventListener("deviceorientation", onOrientation);
    window.addEventListener("devicemotion", onMotion);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("devicemotion", onMotion);
      if (engineRef.current) {
        engineRef.current.gravity.x = 0;
        engineRef.current.gravity.y = 1;
      }
      for (const b of bodies.current) {
        b.friction = 0.45;
        b.frictionStatic = 0.8;
      }
    };
  }, [motion]);

  const askMotion = async () => {
    try {
      const result = await (DeviceOrientationEvent as unknown as OrientationPermission).requestPermission?.();
      const motionPermission = (DeviceMotionEvent as unknown as OrientationPermission).requestPermission;
      if (motionPermission) await motionPermission().catch(() => "denied");
      setMotion(result === "granted" ? "on" : "off");
    } catch {
      setMotion("off");
    }
  };

  const toBox = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (i: number) => (e: PointerEvent<HTMLLIElement>) => {
    const M = matter.current;
    const engine = engineRef.current;
    const body = bodies.current[i];
    if (!M || !engine || !body) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* wskaźnik już zniknął */
    }
    const p = toBox(e);
    // punkt chwytu względem środka naklejki, w jej obróconym układzie
    const dx = p.x - body.position.x;
    const dy = p.y - body.position.y;
    const cos = Math.cos(-body.angle);
    const sin = Math.sin(-body.angle);
    const constraint = M.Constraint.create({
      pointA: p,
      bodyB: body,
      pointB: { x: dx * cos - dy * sin, y: dx * sin + dy * cos },
      stiffness: 0.1,
      damping: 0.12,
      length: 0,
    });
    M.Sleeping.set(body, false);
    M.Composite.add(engine.world, constraint);
    grab.current = { constraint, pointerId: e.pointerId };
  };

  const onMove = (e: PointerEvent<HTMLLIElement>) => {
    const g = grab.current;
    if (!g || g.pointerId !== e.pointerId) return;
    g.constraint.pointA = toBox(e);
  };

  const onUp = (e: PointerEvent<HTMLLIElement>) => {
    const g = grab.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (engineRef.current && matter.current) matter.current.Composite.remove(engineRef.current.world, g.constraint);
    grab.current = null;
  };

  return (
    <div ref={box} className={`relative w-full ${className}`}>
      {children}
      <ul>
          {labels.map((label, i) => (
            <li
              key={i}
              ref={(node) => {
                els.current[i] = node;
              }}
              onPointerDown={onDown(i)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className={`absolute top-0 left-0 cursor-grab touch-none rounded-full px-[0.5em] py-[0.12em] text-[1.55rem] leading-[1.05] font-extrabold tracking-tight whitespace-nowrap shadow-[0_8px_0_rgb(18_12_8/0.15)] transition-opacity duration-300 select-none active:cursor-grabbing ${tones[i]} ${
                ready ? "opacity-100" : "opacity-0"
              }`}
            >
              {label}
            </li>
          ))}
      </ul>
      {motion === "ask" ? (
        <button type="button" onClick={askMotion} className="btn-3d btn-3d-sm absolute top-3 left-1/2 z-10 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 text-sm font-extrabold whitespace-nowrap text-paper">
          <PhoneTiltIcon />
          {t.why.motion}
        </button>
      ) : null}
    </div>
  );
}

function PhoneTiltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2.5" transform="rotate(-18 12 12)" />
      <path d="M3 9a9 9 0 0 1 3-5M21 15a9 9 0 0 1-3 5" />
    </svg>
  );
}
