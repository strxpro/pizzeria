/**
 * Wszystkie treści strony w jednym miejscu.
 *
 * UWAGA: dane restauracji są ZASTĘPCZE — nazwa, adres, telefon, e-mail
 * i współrzędne do podmiany, gdy właściciel poda prawdziwe.
 */

export const RESTAURANT = {
  name: "Pizzeria",
  street: "Via San Vincenzo 12",
  city: "16121 Genova",
  phone: "+39 010 123 4567",
  phoneHref: "tel:+390101234567",
  email: "ordini@pizzeria.it",
  /** Punkt startowy dostaw — od niego liczymy odległość i strefę. ZASTĘPCZY. */
  lat: 44.4057,
  lng: 8.9432,
  /** Czego szukamy na mapie Google (osadzona mapa i link). Wskazane przez klienta. */
  mapsQuery: "Focacceria Santa Teresa Genova",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Focacceria+Santa+Teresa+Genova",
  googleReviewsUrl: "https://www.google.com/maps",
  /**
   * Place ID wizytówki Google — z nim link otwiera od razu okno „Napisz opinię”.
   * PUSTY = do uzupełnienia (Google Place ID Finder); do tego czasu otwieramy wyszukiwanie w Mapach.
   */
  googlePlaceId: "",
  /** Darmowa dostawa od tej kwoty. */
  freeDeliveryFrom: 30,
  /** Minuty od przyjęcia do wyjęcia z pieca. */
  prepMinutes: 15,
} as const;

/**
 * Godziny otwarcia. `day` jak w `Date#getDay()` (0 = niedziela).
 * Zamknięcie po północy zapisujemy jako godzinę > 24 (00:30 → "24:30"),
 * dzięki temu sprawdzanie „czy otwarte" nie musi znać dnia następnego.
 */
export const OPENING = [
  { day: 2, open: "18:00", close: "23:30" },
  { day: 3, open: "18:00", close: "23:30" },
  { day: 4, open: "18:00", close: "23:30" },
  { day: 5, open: "18:00", close: "24:30" },
  { day: 6, open: "18:00", close: "24:30" },
  { day: 0, open: "18:00", close: "23:00" },
  { day: 1, open: null, close: null },
] as const;

export type ArtKey =
  | "margherita"
  | "marinara"
  | "diavola"
  | "capricciosa"
  | "funghi"
  | "quattro"
  | "bufalina"
  | "tartufo"
  | "nduja"
  | "mortadella";

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  /** Cena w euro. */
  price: number;
  art?: ArtKey;
  tag?: "Piccante" | "Vegetariana" | "Novità" | "Più amata";
  /** Zdjęcie z panelu admina (URL); gdy jest, zastępuje rysunek pizzy. */
  photo?: string | null;
  /** Wyłączona pozycja znika ze strony, ale zostaje w panelu. */
  available?: boolean;
};

export type MenuCategory = {
  id: string;
  label: string;
  items: MenuItem[];
};

export const MENU: MenuCategory[] = [
  {
    id: "classiche",
    label: "Classiche",
    items: [
      { id: "margherita", name: "Margherita", description: "San Marzano, fiordilatte, basilico, olio EVO", price: 7.5, art: "margherita", tag: "Più amata" },
      { id: "marinara", name: "Marinara", description: "Pomodoro, aglio, origano, olio EVO", price: 6.5, art: "marinara", tag: "Vegetariana" },
      { id: "diavola", name: "Diavola", description: "Pomodoro, fiordilatte, salame piccante", price: 9.5, art: "diavola", tag: "Piccante" },
      { id: "capricciosa", name: "Capricciosa", description: "Prosciutto cotto, funghi, carciofi, olive", price: 11, art: "capricciosa" },
      { id: "prosciutto-funghi", name: "Prosciutto e funghi", description: "Pomodoro, fiordilatte, cotto, champignon", price: 10, art: "funghi" },
      { id: "quattro-formaggi", name: "Quattro formaggi", description: "Fiordilatte, gorgonzola, pecorino, parmigiano", price: 11.5, art: "quattro", tag: "Vegetariana" },
    ],
  },
  {
    id: "speciali",
    label: "Speciali",
    items: [
      { id: "bufalina", name: "Bufalina", description: "Pomodoro, mozzarella di bufala DOP, basilico", price: 10.5, art: "bufalina" },
      { id: "tartufo-porcini", name: "Tartufo e porcini", description: "Fiordilatte, porcini, crema al tartufo nero", price: 15.5, art: "tartufo", tag: "Novità" },
      { id: "nduja", name: "Nduja e stracciatella", description: "Nduja di Spilinga, stracciatella, limone", price: 14, art: "nduja", tag: "Piccante" },
      { id: "mortadella", name: "Mortadella e pistacchio", description: "Fiordilatte, mortadella IGP, pesto di pistacchio", price: 14.5, art: "mortadella" },
    ],
  },
  {
    id: "bevande",
    label: "Bevande",
    items: [
      { id: "acqua", name: "Acqua", description: "Naturale o frizzante, 0,5 L", price: 1.5 },
      { id: "coca-cola", name: "Coca-Cola", description: "0,33 L", price: 2.5 },
      { id: "chinotto", name: "Chinotto", description: "0,275 L", price: 2.8 },
      { id: "moretti", name: "Birra Moretti", description: "0,33 L", price: 3.5 },
    ],
  },
  {
    id: "dolci",
    label: "Dolci",
    items: [
      { id: "tiramisu", name: "Tiramisù", description: "Fatto in casa, savoiardi e mascarpone", price: 5.5 },
      { id: "panna-cotta", name: "Panna cotta", description: "Con frutti di bosco", price: 5 },
      { id: "cannolo", name: "Cannolo siciliano", description: "Ricotta e pistacchio", price: 4.8 },
    ],
  },
];

export const ALL_ITEMS: MenuItem[] = MENU.flatMap((c) => c.items);

/**
 * Teksty (opisy, kroki, pytania, etapy zamówienia…) żyją w słownikach
 * `src/lib/i18n/dicts/*` — tu zostają tylko dane: ceny, identyfikatory, strefy.
 */

/**
 * Duża lista słów — odpowiednik listy gatunków z referencji.
 * `pizzas` = które grafiki wyskakują obok, gdy składnik jest aktywny.
 */
export const INGREDIENTS: { name: string; origin: string; pizzas: [ArtKey, ArtKey] }[] = [
  { name: "Pomodoro San Marzano", origin: "Agro Sarnese-Nocerino", pizzas: ["marinara", "margherita"] },
  { name: "Fiordilatte", origin: "Agerola", pizzas: ["capricciosa", "diavola"] },
  { name: "Bufala DOP", origin: "Piana del Sele", pizzas: ["bufalina", "margherita"] },
  { name: "Nduja", origin: "Spilinga, Calabria", pizzas: ["nduja", "diavola"] },
  { name: "Mortadella IGP", origin: "Bologna", pizzas: ["mortadella", "quattro"] },
  { name: "Pistacchio", origin: "Bronte", pizzas: ["mortadella", "bufalina"] },
  { name: "Tartufo nero", origin: "Val Nerina", pizzas: ["tartufo", "funghi"] },
  { name: "Basilico", origin: "Pra', Genova", pizzas: ["margherita", "bufalina"] },
  { name: "Olio EVO", origin: "Riviera Ligure", pizzas: ["marinara", "quattro"] },
];

export type Zone = {
  id: string;
  name: string;
  fee: number;
  minimum: number;
  /** Czas jazdy w minutach (bez przygotowania). */
  minutes: number;
  /** Granica strefy w linii prostej od pizzerii. */
  maxKm: number;
};

export const ZONES: Zone[] = [
  { id: "centro", name: "Centro storico", fee: 2, minimum: 15, minutes: 15, maxKm: 1.6 },
  { id: "castelletto", name: "Castelletto e Carignano", fee: 2.5, minimum: 15, minutes: 20, maxKm: 3 },
  { id: "foce", name: "Foce e Albaro", fee: 3.5, minimum: 20, minutes: 30, maxKm: 5.5 },
];

export type Mode = "domicilio" | "ritiro";

/** Etapy zamówienia — kolejność ma znaczenie, kuchnia przesuwa je po kolei. */
export const ORDER_FLOW = {
  domicilio: ["ricevuto", "accettato", "in_viaggio", "consegnato"],
  ritiro: ["ricevuto", "accettato", "pronto", "ritirato"],
} as const;

/** `rifiutato` — zamówienie odrzucone przez lokal; może się zdarzyć tylko przed wyjazdem/wydaniem. */
export type OrderStatus = (typeof ORDER_FLOW)[Mode][number] | "rifiutato";

/** Etapy, o których klient dostaje e-mail. */
export const EMAIL_STATUSES: readonly OrderStatus[] = ["ricevuto", "accettato", "in_viaggio", "consegnato", "pronto", "ritirato", "rifiutato"];

export const FINAL_STATUSES: readonly OrderStatus[] = ["consegnato", "ritirato", "rifiutato"];

/** Kolory naklejek w sekcji „Perché noi” (teksty w słownikach, ta sama kolejność). */
export const STICKER_TONES = ["pomodoro", "notte", "cielo", "basilico", "rosa"] as const;

export type Review = {
  quote: string;
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  /**
   * `true` = treść przykładowa do pokazania układu. Pizzeria jeszcze nie działa,
   * więc nie ma prawdziwych opinii — przykład jest oznaczony na stronie
   * i MUSI zostać zastąpiony prawdziwymi opiniami (np. z Google) przed startem.
   */
  example: boolean;
};

export const REVIEWS: Review[] = [
  { quote: "Impasto leggerissimo, bordo alto e morbido. La Diavola è arrivata ancora calda.", author: "Giulia", rating: 5, example: true },
  { quote: "Consegna puntuale e il rider aveva il POS. Pizza che sa di forno a legna vero.", author: "Marco", rating: 5, example: true },
  { quote: "La bufalina è la mia preferita. Ingredienti di qualità, si sente.", author: "Elena", rating: 5, example: true },
  { quote: "Ordinato alle 21, alle 21:35 ero a tavola. Tartufo e porcini da rifare.", author: "Luca", rating: 4, example: true },
  { quote: "Finalmente una nduja che pizzica davvero. Il cannolo poi, da solo vale l'ordine.", author: "Sara", rating: 5, example: true },
];

