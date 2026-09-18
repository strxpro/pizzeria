"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { OrderStatus } from "@/lib/data";
import { PIZZERIA, type LatLng } from "@/lib/geo";
import { useT } from "@/lib/i18n/provider";
import { curvePoint, loadRoute, pathUntil, pointAt, type RoutePath } from "@/lib/route-path";

export const pin = (color: string, label: string) => `
  <div class="map-pin">
    <svg viewBox="-18 -48 36 50" width="36" height="50" aria-hidden="true">
      <path d="M0 0c-10-12-16-20-16-28a16 16 0 0 1 32 0c0 8-6 16-16 28Z" fill="${color}" stroke="#120c08" stroke-width="3"/>
      <circle cy="-28" r="5" fill="#120c08"/>
    </svg>
    <span>${label}</span>
  </div>`;

export const RIDER = `
  <div class="map-rider">
    <svg viewBox="-20 -20 40 40" width="40" height="40" aria-hidden="true">
      <circle r="18" fill="#ffcf3f" stroke="#120c08" stroke-width="3"/>
      <path d="M-10 4h14l4-8h-6M-7 4a4 4 0 1 0 0.1 0M9 4a4 4 0 1 0 0.1 0" fill="none" stroke="#120c08" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>`;

/**
 * Mapa śledzenia na Leaflet (bez klucza API): kafelki CARTO na danych OpenStreetMap,
 * pinezki pizzerii i klienta, trasa po prawdziwych ulicach (OSRM; bez odpowiedzi — łuk)
 * i skuter: w prawdziwej pozycji, gdy kierowca udostępnia GPS z panelu, a bez tego
 * w pozycji SZACOWANEJ z czasu jazdy — jedzie wtedy po tej samej trasie.
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
  const trail = useRef<Polyline | null>(null);
  const [path, setPath] = useState<RoutePath | null>(null);
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
        L.marker([target.lat, target.lng], { icon: icon(pin("#3fd38a", homeLabel ?? t.tracking.you), [36, 50], [18, 48]), keyboard: false }).addTo(m);
        rider.current = L.marker(curvePoint(PIZZERIA, target, 0), { icon: icon(RIDER, [40, 40], [20, 20]), keyboard: false, opacity: 0, zIndexOffset: 1000 }).addTo(m);
        m.fitBounds(L.latLngBounds([[PIZZERIA.lat, PIZZERIA.lng], [target.lat, target.lng]]), { padding: [56, 56], maxZoom: 16 });
        // prawdziwa trasa po ulicach — dorysowujemy, gdy przyjdzie z serwera
        const route = await loadRoute(target);
        if (cancelled || map.current !== m) return;
        L.polyline(route.points, { color: "#120c08", weight: 4, opacity: 0.6, dashArray: "2 10", lineCap: "round" }).addTo(m);
        trail.current = L.polyline([route.points[0]], { color: "#ff5a36", weight: 6, lineCap: "round", lineJoin: "round" }).addTo(m);
        m.fitBounds(L.latLngBounds(route.points), { padding: [56, 56], maxZoom: 16 });
        setPath(route);
      } else {
        m.setView([PIZZERIA.lat, PIZZERIA.lng], 16);
      }
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      rider.current = null;
      trail.current = null;
    };
    // mapę budujemy od nowa tylko, gdy zmienia się trasa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Skuter jedzie po trasie razem z szacowanym postępem (albo stoi tam, gdzie pokazuje GPS).
  useEffect(() => {
    const r = rider.current;
    if (!r) return;
    const p = riding ? progress : 0;
    r.setOpacity(riding || live ? 1 : 0);
    r.setLatLng(live ? [live.lat, live.lng] : path ? pointAt(path, p) : curvePoint(PIZZERIA, target, p));
    if (path && trail.current) trail.current.setLatLngs(riding && !live ? pathUntil(path, p) : [path.points[0]]);
  });

  return <div ref={box} role="img" aria-label={t.tracking.mapAria} className={`route-map relative isolate z-0 w-full bg-[#f2efe9] ${className}`} />;
}
