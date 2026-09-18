"use client";

import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap, Marker, Polyline } from "leaflet";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { RESTAURANT } from "@/lib/data";
import { PIZZERIA } from "@/lib/geo";
import { useT } from "@/lib/i18n/provider";
import { loadRoute, pathUntil, pointAt, streetAt, type RoutePath } from "@/lib/route-path";
import { pin, RIDER } from "./route-map";

/**
 * Prawdziwe miejsca w Genui, do których „jedzie” pokazowa dostawa. Trasę po ulicach
 * wyznacza serwer (OSRM, dane OpenStreetMap), więc skuter skręca tam, gdzie naprawdę trzeba.
 */
const PLACES = [
  { name: "Boccadasse", lat: 44.39265, lng: 8.9728 },
  { name: "Castelletto", lat: 44.41318, lng: 8.93185 },
  { name: "Foce", lat: 44.39835, lng: 8.95205 },
  { name: "Piazza De Ferrari", lat: 44.40717, lng: 8.93385 },
  { name: "Via Assarotti", lat: 44.4114, lng: 8.9419 },
] as const;

type Phase = "confirmed" | "oven" | "departed" | "riding" | "arrived";

/** Długości etapów (ms). Jazda zależy od długości trasy — krótka trasa, krótsza jazda. */
const TIMES = { confirmed: 1700, oven: 1500, departed: 900, arrived: 2600 };
const rideMs = (path: RoutePath) => Math.min(11_000, 6000 + (path.km || 2) * 900);

const ICONS: Record<Phase, string> = { confirmed: "✅", oven: "🔥", departed: "🛵", riding: "🛵", arrived: "🍕" };

/**
 * Mapa w sekcji dostawy: darmowy Leaflet (kafelki CARTO na OpenStreetMap), wczytywany razem
 * ze stroną — gdy klient do niej dojedzie, jest już gotowa. Pokazuje w pętli, jak wygląda
 * dostawa: zamówienie potwierdzone → pizza w piecu → kurier wyjeżdża → jedzie prawdziwymi
 * ulicami (komentarz podaje nazwę ulicy) → dostarczone. Potem kolejny adres.
 *
 * Animacja chodzi tylko, gdy mapa jest na ekranie (zegar stoi poza nim), a mapa nie łapie
 * przewijania ani gestów — to pokaz, nie nawigacja.
 */
export function DeliveryMap({ className = "" }: { className?: string }) {
  const t = useT();
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("confirmed");
  const [street, setStreet] = useState<string | null>(null);
  const [place, setPlace] = useState(0);
  const [route, setRoute] = useState<RoutePath | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let alive = true;
    let map: LeafletMap | null = null;
    let raf = 0;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);

    // trasy do wszystkich adresów pobieramy od razu — przełączanie jest natychmiastowe
    const routes = PLACES.map((p) => loadRoute(p));

    (async () => {
      const L = await import("leaflet");
      if (!alive) return;
      map = L.map(el, {
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomControl: false,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);
      map.setView([PIZZERIA.lat, PIZZERIA.lng], 14);

      const icon = (html: string, size: [number, number], anchor: [number, number]) => L.divIcon({ html, className: "", iconSize: size, iconAnchor: anchor });
      const shop = L.marker([PIZZERIA.lat, PIZZERIA.lng], { icon: icon(pin("#ff5a36", RESTAURANT.name), [36, 50], [18, 48]), keyboard: false, zIndexOffset: 500 }).addTo(map);

      // warstwy jednego kursu: trasa przerywana, przejechany odcinek, dom, skuter
      // (as — bo przypisujemy je w setup(); inaczej TypeScript uzna, że zawsze są null)
      let layer = null as LayerGroup | null;
      let done = null as Polyline | null;
      let rider = null as Marker | null;
      let home = null as Marker | null;
      let path = null as RoutePath | null;
      let index = 0;
      let clock = 0;
      let last = 0;
      let shown: Phase | null = null;
      let shownStreet: string | null = null;
      let lastTrail = 0;

      const setup = async (i: number) => {
        path = await routes[i];
        if (!alive || !map) return;
        layer?.remove();
        layer = L.layerGroup().addTo(map);
        L.polyline(path.points, { color: "#120c08", weight: 4, opacity: 0.55, dashArray: "2 10", lineCap: "round" }).addTo(layer);
        done = L.polyline([path.points[0]], { color: "#ff5a36", weight: 6, lineCap: "round", lineJoin: "round" }).addTo(layer);
        home = L.marker(path.points.at(-1)!, { icon: icon(pin("#3fd38a", PLACES[i].name), [36, 50], [18, 48]), keyboard: false }).addTo(layer);
        rider = L.marker(path.points[0], { icon: icon(RIDER, [40, 40], [20, 20]), keyboard: false, opacity: 0, zIndexOffset: 1000 }).addTo(layer);
        map.fitBounds(L.latLngBounds(path.points), { padding: [70, 50], maxZoom: 16, animate: shown !== null });
        setRoute(path);
        setPlace(i);
        clock = 0;
        lastTrail = 0;
      };

      const show = (p: Phase) => {
        if (p === shown) return;
        shown = p;
        setPhase(p);
        shop.getElement()?.classList.toggle("is-busy", p === "confirmed" || p === "oven");
        home?.getElement()?.classList.toggle("is-hit", p === "arrived");
      };

      await setup(0);
      if (!alive) return;

      if (reduced) {
        // bez animacji: od razu widać całą trasę i skuter u celu
        if (path && rider && done) {
          done.setLatLngs(path.points);
          rider.setLatLng(path.points.at(-1)!);
          rider.setOpacity(1);
        }
        show("arrived");
        return;
      }

      let busy = false;
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const dt = last ? Math.min(now - last, 64) : 16;
        last = now;
        if (!visible || busy || !path || !rider || !done) return;
        clock += dt;

        const ride = rideMs(path);
        const tOven = TIMES.confirmed;
        const tDepart = tOven + TIMES.oven;
        const tRide = tDepart + TIMES.departed;
        const tArrive = tRide + ride;
        const tEnd = tArrive + TIMES.arrived;

        if (clock < tOven) show("confirmed");
        else if (clock < tDepart) show("oven");
        else if (clock < tRide) show("departed");
        else if (clock < tArrive) show("riding");
        else if (clock < tEnd) show("arrived");
        else {
          // następny adres
          busy = true;
          index = (index + 1) % PLACES.length;
          setup(index).then(() => {
            busy = false;
          });
          return;
        }

        // postęp jazdy: łagodny start i hamowanie przed domem
        const raw = Math.min(1, Math.max(0, (clock - tRide) / ride));
        const progress = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
        const onRoad = clock >= tDepart;
        rider.setOpacity(onRoad ? 1 : 0);
        const at = pointAt(path, progress);
        rider.setLatLng(at);
        // skuter patrzy w stronę jazdy
        const ahead = pointAt(path, Math.min(1, progress + 0.01));
        const svg = rider.getElement()?.querySelector("svg");
        if (svg) svg.style.transform = ahead[1] < at[1] - 1e-6 ? "scaleX(-1)" : "";
        // linia za skuterem — co ~80 ms wystarczy, żeby wyglądała płynnie
        if (now - lastTrail > 80 || raw === 1) {
          lastTrail = now;
          done.setLatLngs(onRoad ? pathUntil(path, progress) : [path.points[0]]);
        }
        const s = clock >= tRide && clock < tArrive ? streetAt(path, progress) : null;
        if (s !== shownStreet) {
          shownStreet = s;
          setStreet(s);
        }
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      alive = false;
      io.disconnect();
      cancelAnimationFrame(raf);
      map?.remove();
    };
  }, [reduced]);

  const caption = phase === "riding" && street ? t.delivery.demo.riding(street) : t.delivery.demo[phase === "riding" ? "departed" : phase];
  const stage = phase === "arrived" ? 2 : phase === "departed" || phase === "riding" ? 1 : 0;

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div ref={box} role="img" aria-label={t.delivery.mapTitle(RESTAURANT.mapsQuery)} className="route-map absolute inset-0 z-0 bg-[#f2efe9]" />

      {/* komentarz na żywo: co się teraz dzieje z zamówieniem */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex flex-col items-start gap-2">
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-extrabold tracking-wide text-giallo uppercase">{t.delivery.demo.live}</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={caption}
            initial={{ y: -12, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="flex max-w-full items-center gap-2 rounded-2xl border-[2.5px] border-ink bg-paper px-3 py-2 text-base leading-tight font-extrabold shadow-[0_4px_0_var(--color-ink)]"
            aria-live="polite"
          >
            <span aria-hidden className="text-lg leading-none">
              {ICONS[phase]}
            </span>
            <span className="truncate">{caption}</span>
          </motion.p>
        </AnimatePresence>
      </div>

      {/* etapy i dane kursu */}
      <div className="pointer-events-none absolute inset-x-3 bottom-7 z-[500] flex flex-wrap items-end justify-between gap-2">
        <ol className="flex items-center gap-1 rounded-full border-[2.5px] border-ink bg-paper p-1 text-xs font-extrabold shadow-[0_3px_0_var(--color-ink)]">
          {t.delivery.demo.steps.map((label, i) => (
            <li key={label} className={`rounded-full px-2.5 py-1 transition-colors duration-300 ${i === stage ? "bg-ink text-paper" : i < stage ? "bg-basilico" : "opacity-50"}`}>
              {label}
            </li>
          ))}
        </ol>
        {route ? (
          <p className="rounded-full border-[2.5px] border-ink bg-giallo px-3 py-1 text-xs font-extrabold shadow-[0_3px_0_var(--color-ink)]">
            {t.delivery.demo.to(PLACES[place].name)}
            {route.real ? ` · ${t.delivery.demo.eta(route.minutes, route.km)}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
