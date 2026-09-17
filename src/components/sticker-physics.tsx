"use client";

import type { Body as MatterBody, Constraint as MatterConstraint, Engine as MatterEngine } from "matter-js";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useT } from "@/lib/i18n/provider";

type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

/** Odstęp ścian od krawędzi sekcji — naklejki nie dotykają brzegu ekranu. */
const PAD = 10;
/** Stały krok symulacji (ms) — ten sam przy 60 i 120 Hz, bez drgań i przenikania. */
const STEP = 1000 / 120;
/** Grubość niewidocznych ścian. */
const WALL = 200;
const MAX_SPEED = 30;
/** Wzmocnienie przechyłu: małe pochylenie telefonu wyraźnie przesuwa naklejki. */
const TILT_GAIN = 3.4;
const TILT_MAX = 2.4;

/**
 * Pozycja startowa (przed włączeniem): naklejki rozrzucone pod znakiem, lekko przekrzywione.
 * `side` — od której krawędzi liczymy `x` (%), `y` — górna krawędź naklejki (% wysokości), `rot` — stopnie.
 */
const START = [
  { side: "l", x: 3, y: 52, rot: -6 },
  { side: "r", x: 3, y: 61, rot: 5 },
  { side: "l", x: 8, y: 70, rot: 3 },
  { side: "r", x: 6, y: 79, rot: -4 },
  { side: "l", x: 4, y: 88, rot: -2 },
] as const;

const place = (node: HTMLElement, x: number, y: number, angle: number) => {
  node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${angle.toFixed(3)}rad)`;
};

/**
 * Naklejki z prawdziwą fizyką (matter-js, ładowany chwilę przed wjazdem sekcji):
 * - na starcie leżą spokojnie w pozycji startowej;
 * - „Włącz ruch telefonem” (albo złapanie naklejki) ożywia je: spadają z miejsca, w którym leżą,
 *   dają się łapać i rzucać, a przechylenie telefonu zmienia kierunek grawitacji (w prawo = w prawo);
 * - bez przeszkód w środku, ze śliskimi ścianami i bez usypiania ciał — nic się nie klinuje;
 * - iPhone wymaga zgody na czujniki ruchu (prosimy o nią po stuknięciu w przycisk).
 * Symulacja działa tylko, gdy sekcja jest widoczna; pozycje wpisujemy jako `transform`.
 */
export function StickerPhysics({ labels, tones, children, className = "" }: { labels: string[]; tones: string[]; children?: ReactNode; className?: string }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLLIElement | null)[]>([]);
  const engineRef = useRef<MatterEngine | null>(null);
  const bodies = useRef<MatterBody[]>([]);
  const walls = useRef<MatterBody[]>([]);
  const sizes = useRef<{ w: number; h: number }[]>([]);
  const grab = useRef<{ constraint: MatterConstraint; pointerId: number } | null>(null);
  const matter = useRef<typeof import("matter-js") | null>(null);
  const visible = useRef(false);
  const liveRef = useRef(false);
  const [placed, setPlaced] = useState(false);
  const [shown, setShown] = useState(false);
  const [live, setLive] = useState(false);
  const [touch, setTouch] = useState(false);
  const [motion, setMotion] = useState<"off" | "on">("off");

  // Pozycja startowa — liczona z rozmiaru sekcji, zanim cokolwiek się pokaże.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const arrange = () => {
      if (liveRef.current) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      els.current.forEach((node, i) => {
        if (!node) return;
        const s = START[i % START.length];
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        const left = s.side === "l" ? (W * s.x) / 100 : W - (W * s.x) / 100 - w;
        const x = Math.max(PAD, Math.min(W - PAD - w, left));
        const y = Math.max(PAD, Math.min(H - PAD - h, (H * s.y) / 100));
        place(node, x, y, (s.rot * Math.PI) / 180);
      });
    };
    arrange();
    const id = setTimeout(() => setPlaced(true), 0);
    const ro = new ResizeObserver(arrange);
    ro.observe(el);
    return () => {
      clearTimeout(id);
      ro.disconnect();
    };
  }, [labels]);

  useEffect(() => {
    const id = setTimeout(() => setTouch(window.matchMedia("(pointer: coarse)").matches && "DeviceMotionEvent" in window), 0);
    return () => clearTimeout(id);
  }, []);

  // Widoczność: wczytanie biblioteki z wyprzedzeniem, symulacja tylko na ekranie.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        visible.current = e.isIntersecting;
        if (!e.isIntersecting) return;
        setShown(true);
        if (!matter.current) import("matter-js").then((m) => (matter.current = m.default));
      },
      { rootMargin: "0px 0px 240px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /** Ożywienie: ciała w miejscach, w których naklejki leżą teraz, i grawitacja w dół. */
  const activate = async () => {
    if (liveRef.current) return true;
    const el = box.current;
    if (!el) return false;
    const M = matter.current ?? (await import("matter-js")).default;
    matter.current = M;
    if (liveRef.current) return true;
    liveRef.current = true;

    const { Engine, Bodies, Composite } = M;
    const engine = Engine.create({ enableSleeping: false, positionIterations: 10, velocityIterations: 8, constraintIterations: 4 });
    engine.gravity.y = 1;
    engineRef.current = engine;

    const W = el.clientWidth;
    const H = el.clientHeight;
    // ściany bez tarcia — naklejka nie zaklinuje się w poprzek sekcji
    walls.current = [
      Bodies.rectangle(W / 2, H - PAD + WALL / 2, W * 3, WALL, { isStatic: true, friction: 0.3 }),
      Bodies.rectangle(PAD - WALL / 2, H / 2, WALL, H * 4, { isStatic: true, friction: 0 }),
      Bodies.rectangle(W - PAD + WALL / 2, H / 2, WALL, H * 4, { isStatic: true, friction: 0 }),
      Bodies.rectangle(W / 2, PAD - WALL / 2, W * 3, WALL, { isStatic: true, friction: 0 }),
    ];
    Composite.add(engine.world, walls.current);

    const origin = el.getBoundingClientRect();
    sizes.current = els.current.map((node) => ({ w: node?.offsetWidth ?? 120, h: node?.offsetHeight ?? 48 }));
    bodies.current = els.current.map((node, i) => {
      const { w, h } = sizes.current[i];
      const r = node?.getBoundingClientRect();
      const cx = r ? r.left - origin.left + r.width / 2 : W / 2;
      const cy = r ? r.top - origin.top + r.height / 2 : H / 2;
      return Bodies.rectangle(cx, cy, w, h, {
        chamfer: { radius: h / 2 - 1 },
        angle: (START[i % START.length].rot * Math.PI) / 180,
        restitution: 0.2,
        friction: 0.06,
        frictionStatic: 0.12,
        frictionAir: 0.012,
        density: 0.0018,
        slop: 0.02,
      });
    });
    Composite.add(engine.world, bodies.current);
    setLive(true);
    return true;
  };

  // Pętla symulacji po ożywieniu.
  useEffect(() => {
    if (!live) return;
    const engine = engineRef.current;
    const M = matter.current;
    const el = box.current;
    if (!engine || !M || !el) return;
    let raf = 0;
    let last = 0;
    let acc = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(now - last, 50) : STEP;
      last = now;
      if (!visible.current) return;
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 6) {
        M.Engine.update(engine, STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === 6) acc = 0;
      bodies.current.forEach((b, i) => {
        const v = b.velocity;
        const speed = Math.hypot(v.x, v.y);
        if (speed > MAX_SPEED) M.Body.setVelocity(b, { x: (v.x / speed) * MAX_SPEED, y: (v.y / speed) * MAX_SPEED });
        const node = els.current[i];
        if (node) place(node, b.position.x - sizes.current[i].w / 2, b.position.y - sizes.current[i].h / 2, b.angle);
      });
    };
    raf = requestAnimationFrame(tick);

    // Obrót telefonu zmienia szerokość sekcji — ściany jadą za nią, naklejki zostają w środku.
    let size = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (Math.abs(W - size.w) < 2 && Math.abs(H - size.h) < 2) return;
      size = { w: W, h: H };
      const [floor, left, right, top] = walls.current;
      M.Body.setPosition(floor, { x: W / 2, y: H - PAD + WALL / 2 });
      M.Body.setPosition(left, { x: PAD - WALL / 2, y: H / 2 });
      M.Body.setPosition(right, { x: W - PAD + WALL / 2, y: H / 2 });
      M.Body.setPosition(top, { x: W / 2, y: PAD - WALL / 2 });
      for (const b of bodies.current) {
        M.Body.setPosition(b, { x: Math.min(W - PAD - 40, Math.max(PAD + 40, b.position.x)), y: Math.min(H - PAD - 30, Math.max(PAD + 30, b.position.y)) });
      }
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [live]);

  useEffect(
    () => () => {
      if (engineRef.current && matter.current) matter.current.Engine.clear(engineRef.current);
      engineRef.current = null;
    },
    [],
  );

  // Czujniki ruchu — dopiero po włączeniu.
  useEffect(() => {
    if (motion !== "on" || !live) return;
    const clamp = (v: number) => Math.max(-TILT_MAX, Math.min(TILT_MAX, v));

    // Kierunek bierzemy z wektora grawitacji czujnika, nie z kątów beta/gamma: kąty „wariują”,
    // gdy telefon stoi pionowo. Safari i Chrome podają ten wektor z przeciwnym znakiem — znak
    // ustalamy sami: gdy telefon jest wyraźnie pionowo (beta), grawitacja ciągnie w dół ekranu.
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
        // wygładzenie tylko od drżenia ręki — reakcja praktycznie natychmiastowa
        gx += (clamp(dx * TILT_GAIN) - gx) * 0.55;
        gy += (clamp(dy * TILT_GAIN) - gy) * 0.55;
        engine.gravity.x = gx;
        engine.gravity.y = gy;
      }

      const a = e.acceleration;
      if (!a) return;
      const force = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      const now = Date.now();
      if (force < 13 || now - lastShake < 400) return;
      lastShake = now;
      bodies.current.forEach((b) => {
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
    };
  }, [motion, live]);

  const enableMotion = async () => {
    try {
      const orientation = (DeviceOrientationEvent as unknown as OrientationPermission).requestPermission;
      const motionPermission = (DeviceMotionEvent as unknown as OrientationPermission).requestPermission;
      // prośby o zgodę muszą paść od razu po stuknięciu (iPhone), przed czymkolwiek innym
      const results = await Promise.all([orientation ? orientation() : "granted", motionPermission ? motionPermission() : "granted"]);
      if (results.every((r) => r === "granted")) setMotion("on");
      else setTouch(false);
    } catch {
      // brak zgody — naklejki i tak ożyją, tylko bez przechyłu
      setTouch(false);
    }
    await activate();
  };

  const toBox = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (i: number) => async (e: PointerEvent<HTMLLIElement>) => {
    const target = e.currentTarget;
    const pointerId = e.pointerId;
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* wskaźnik już zniknął */
    }
    const p = toBox(e);
    if (!(await activate())) return;
    const M = matter.current;
    const engine = engineRef.current;
    const body = bodies.current[i];
    if (!M || !engine || !body) return;
    // punkt chwytu względem środka naklejki, w jej obróconym układzie
    const dx = p.x - body.position.x;
    const dy = p.y - body.position.y;
    const cos = Math.cos(-body.angle);
    const sin = Math.sin(-body.angle);
    const constraint = M.Constraint.create({
      pointA: p,
      bodyB: body,
      pointB: { x: dx * cos - dy * sin, y: dx * sin + dy * cos },
      stiffness: 0.18,
      damping: 0.12,
      length: 0,
    });
    M.Composite.add(engine.world, constraint);
    grab.current = { constraint, pointerId };
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
            className="absolute top-0 left-0 cursor-grab touch-none select-none active:cursor-grabbing"
          >
            {/* pojawienie się (skala) na wewnętrznym elemencie — nie miesza się z pozycją z fizyki */}
            <span
              style={{ transitionDelay: `${i * 70}ms` }}
              className={`block rounded-full px-[0.5em] py-[0.12em] text-[1.55rem] leading-[1.05] font-extrabold tracking-tight whitespace-nowrap shadow-[0_8px_0_rgb(18_12_8/0.15)] transition-[opacity,scale] duration-500 ease-(--ease-out) ${tones[i]} ${
                placed && shown ? "scale-100 opacity-100" : "scale-75 opacity-0"
              }`}
            >
              {label}
            </span>
          </li>
        ))}
      </ul>
      {touch && motion === "off" ? (
        <button
          type="button"
          onClick={enableMotion}
          className="btn-3d btn-3d-sm absolute top-[40%] left-1/2 z-10 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 text-sm font-extrabold whitespace-nowrap text-paper"
        >
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
