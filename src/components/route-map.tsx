"use client";

import "leaflet/dist/leaflet.css";
import type { LatLngTuple, Map as LeafletMap, Marker } from "leaflet";
import { useEffect, useRef } from "react";
import type { OrderStatus } from "@/lib/data";
import { PIZZERIA, type LatLng } from "@/lib/geo";
import { useT } from "@/lib/i18n/provider";

/** Punkt na łuku między pizzerią a domem — ten sam łuk rysuje trasę i niesie skuter. */
function curvePoint(a: LatLng, b: LatLng, t: number): LatLngTuple {
  const c = { lat: (a.lat + b.lat) / 2 - (b.lng - a.lng) * 0.25, lng: (a.lng + b.lng) / 2 + (b.lat - a.lat) * 0.25 };
  const u = 1 - t;
  return [u * u * a.lat + 2 * u * t * c.lat + t * t * b.lat, u * u * a.lng + 2 * u * t * c.lng + t * t * b.lng];
}

const pin = (color: string, label: string) => `
  <div class="map-pin">
    <svg viewBox="-18 -48 36 50" width="36" height="50" aria-hidden="true">
      <path d="M0 0c-10-12-16-20-16-28a16 16 0 0 1 32 0c0 8-6 16-16 28Z" fill="${color}" stroke="#120c08" stroke-width="3"/>
      <circle cy="-28" r="5" fill="#120c08"/>
    </svg>
    <span>${label}</span>
  </div>`;

const RIDER = `
  <div class="map-rider">
    <svg viewBox="-20 -20 40 40" width="40" height="40" aria-hidden="true">
      <circle r="18" fill="#ffcf3f" stroke="#120c08" stroke-width="3"/>
      <path d="M-10 4h14l4-8h-6M-7 4a4 4 0 1 0 0.1 0M9 4a4 4 0 1 0 0.1 0" fill="none" stroke="#120c08" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>`;

/**
 * Mapa śledzenia na Leaflet (bez klucza API): kafelki CARTO na danych OpenStreetMap,
 * pinezki pizzerii i klienta, przerywany łuk trasy i skuter: w prawdziwej pozycji, gdy kierowca
 * udostępnia GPS z panelu, a bez tego w pozycji SZACOWANEJ z czasu jazdy.
 *
 * Mapa nie przejmuje przewijania strony: kółko myszy nie przybliża, a na dotyku
 * jeden palec przewija stronę (mapę przesuwa się dwoma palcami / przybliża gestem).
 */
export function RouteMap({
  home,
  delivery,
  progress,
  status,
  rider: live = null,
  homeLabel,
  className = "aspect-[3/2]",
}: {
  home: LatLng | null;
  delivery: boolean;
  progress: number;
  status: OrderStatus;
  /** Prawdziwa pozycja kierowcy (GPS z panelu) — gdy jest, zastępuje szacunek. */
  rider?: LatLng | null;
  homeLabel?: string;
  className?: string;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const rider = useRef<Marker | null>(null);
  const riding = delivery && (status === "in_viaggio" || status === "consegnato");
  // Bez GPS klienta dom stoi w umownym miejscu — trasa jest poglądowa.
  const target = home ?? { lat: PIZZERIA.lat + 0.008, lng: PIZZERIA.lng + 0.012 };
  const key = `${target.lat},${target.lng},${delivery}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !box.current) return;
      const touch = window.matchMedia("(pointer: coarse)").matches;
      const m = L.map(box.current, {
        scrollWheelZoom: false,
        dragging: !touch,
        touchZoom: true,
        zoomControl: true,
        attributionControl: true,
      });
      map.current = m;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(m);

      const icon = (html: string, size: [number, number], anchor: [number, number]) => L.divIcon({ html, className: "", iconSize: size, iconAnchor: anchor });
      L.marker([PIZZERIA.lat, PIZZERIA.lng], { icon: icon(pin("#ff5a36", "Pizzeria"), [36, 50], [18, 48]), keyboard: false }).addTo(m);

      if (delivery) {
        const points = Array.from({ length: 33 }, (_, i) => curvePoint(PIZZERIA, target, i / 32));
        L.polyline(points, { color: "#120c08", weight: 4, dashArray: "2 10", lineCap: "round" }).addTo(m);
        L.marker([target.lat, target.lng], { icon: icon(pin("#3fd38a", homeLabel ?? t.tracking.you), [36, 50], [18, 48]), keyboard: false }).addTo(m);
        rider.current = L.marker(curvePoint(PIZZERIA, target, 0), { icon: icon(RIDER, [40, 40], [20, 20]), keyboard: false, opacity: 0 }).addTo(m);
        m.fitBounds(L.latLngBounds([[PIZZERIA.lat, PIZZERIA.lng], [target.lat, target.lng]]), { padding: [56, 56], maxZoom: 16 });
      } else {
        m.setView([PIZZERIA.lat, PIZZERIA.lng], 16);
      }
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      rider.current = null;
    };
    // mapę budujemy od nowa tylko, gdy zmienia się trasa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Skuter jedzie po łuku razem z szacowanym postępem.
  useEffect(() => {
    const r = rider.current;
    if (!r) return;
    r.setOpacity(riding || live ? 1 : 0);
    r.setLatLng(live ? [live.lat, live.lng] : curvePoint(PIZZERIA, target, riding ? progress : 0));
  });

  return <div ref={box} role="img" aria-label={t.tracking.mapAria} className={`route-map relative isolate z-0 w-full bg-[#f2efe9] ${className}`} />;
}
