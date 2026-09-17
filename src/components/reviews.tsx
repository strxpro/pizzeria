"use client";

import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RESTAURANT, REVIEWS } from "@/lib/data";
import { useLang, useT } from "@/lib/i18n/provider";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { HandNote } from "./kit";

const TONES = ["bg-giallo", "bg-rosa", "bg-cielo", "bg-menta", "bg-pomodoro"] as const;
const HAPPY = ["❤️", "😍", "🤩", "😋", "🥳", "😂", "🤪", "🍕", "💛", "😎", "🔥", "👏"];

/**
 * Emotki w tle tworzymy poza Reactem: kilka elementów dopisanych prosto do warstwy,
 * animowanych w CSS i usuwanych po skończeniu animacji. Sekcja (talia kart, formularz)
 * nie renderuje się przy tym ponownie, więc nic nie przycina. Wszystkie mają ten sam
 * rozmiar czcionki (glif rasteryzuje się raz), a różnicę wielkości daje `scale`.
 */
function spawnEmojis(layer: HTMLElement, emojis: string[], count: number, origin?: { x: number }) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "emoji-fly";
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const left = origin ? origin.x + (Math.random() - 0.5) * 16 : Math.random() * 96;
    el.style.left = `${left}%`;
    el.style.setProperty("--s", String(0.7 + Math.random() * 0.8));
    el.style.setProperty("--dx", `${(Math.random() - 0.5) * 160}px`);
    el.style.setProperty("--rise", `${-(55 + Math.random() * 45)}vh`);
    el.style.setProperty("--rot", `${(Math.random() - 0.5) * 120}deg`);
    el.style.setProperty("--dur", `${2.2 + Math.random() * 1.8}s`);
    el.style.setProperty("--delay", `${Math.random() * (origin ? 0.2 : 0.9)}s`);
    el.addEventListener("animationend", () => el.remove(), { once: true });
    fragment.appendChild(el);
  }
  layer.appendChild(fragment);
}

/** Karta w talii: prawdziwa opinia z serwera albo przykład z danych. */
type DeckReview = { key: string; rating: number; quote: string; author: string; example: boolean; verified: boolean; photos: string[]; google?: string | null; createdAt?: string };
type PublicFeedback = { items: { id: string; rating: number; name: string; text: string; verified: boolean; photos?: string[]; createdAt: string }[]; count: number; average: number };
type GoogleItem = { id: string; rating: number; text: string; author: string; authorUrl: string | null };

const EXAMPLES: DeckReview[] = REVIEWS.map((r, i) => ({ key: `ex-${i}`, rating: r.rating, quote: r.quote, author: r.author, example: true, verified: false, photos: [] }));

/** Prawdziwe opinie z serwera; przykłady dokładamy tylko, dopóki prawdziwych jest mniej niż trzy. */
function usePublicReviews(anonymous: string, lang: string) {
  const [data, setData] = useState<PublicFeedback | null>(null);
  const [google, setGoogle] = useState<GoogleItem[]>([]);
  const load = useCallback(() => {
    fetch("/api/feedback/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PublicFeedback | null) => d && setData(d))
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  // dobre opinie z wizytówki Google (gdy serwer ma klucz Places API)
  useEffect(() => {
    let alive = true;
    fetch(`/api/feedback/google?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items: GoogleItem[] } | null) => alive && d && setGoogle(d.items))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [lang]);

  const real: DeckReview[] = (data?.items ?? []).map((i) => ({
    key: i.id,
    rating: i.rating,
    quote: i.text,
    author: i.name || anonymous,
    example: false,
    verified: i.verified,
    photos: i.photos ?? [],
    createdAt: i.createdAt,
  }));
  const fromGoogle: DeckReview[] = google.map((g) => ({
    key: g.id,
    rating: g.rating,
    quote: g.text,
    author: g.author,
    example: false,
    verified: false,
    photos: [],
    google: g.authorUrl ?? "",
  }));
  const own = [...real, ...fromGoogle];
  const deck = own.length >= 3 ? own : [...own, ...EXAMPLES];
  const stats =
    data && data.count > 0
      ? { average: data.average, count: data.count }
      : { average: EXAMPLES.reduce((n, r) => n + r.rating, 0) / EXAMPLES.length, count: EXAMPLES.length };
  // Dopóki serwer nie odpowie, talii nie pokazujemy — inaczej na chwilę mignęłyby przykłady z samymi 5★.
  return { deck, own, loaded: data !== null, stats, examplesOnly: real.length === 0, reload: load };
}

/**
 * Opinie jako talia kart do przerzucania.
 *
 * - górną kartę łapie się i rzuca w bok (mysz albo palec) — odlatuje z obrotem
 *   i wraca na spód talii; strzałki robią to samo;
 * - po wejściu w sekcję tło wypełnia się radosnymi emotkami, a przyciski
 *   reakcji wystrzeliwują własną serię;
 * - wszystkie animacje to transform/opacity.
 *
 * Opinie są PRZYKŁADOWE (pizzeria jeszcze nie działa) — mają etykietę „Esempio”.
 */
export function Reviews() {
  const t = useT();
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const { deck, own, loaded, stats, examplesOnly, reload } = usePublicReviews(t.reviews.anonymous, useLang().lang);
  // Obrót talii zapamiętany razem z jej składem — po doczytaniu opinii z serwera zaczyna się od nowa.
  const deckKey = deck.map((r) => r.key).join("|");
  const [shuffle, setShuffle] = useState({ deckKey, rotation: 0 });
  const rotation = shuffle.deckKey === deckKey ? shuffle.rotation : 0;
  const order = deck.map((_, i) => (i + rotation) % deck.length);
  const sky = useRef<HTMLDivElement>(null);
  const average = stats.average;

  const burst = useCallback(
    (emojis: string[], count: number, origin?: { x: number }) => {
      if (reduced || !sky.current) return;
      // na telefonie mniej — i tak wypełniają cały wąski ekran
      const n = window.innerWidth < 640 ? Math.ceil(count * 0.6) : count;
      spawnEmojis(sky.current, emojis, n, origin);
    },
    [reduced],
  );

  // Seria emotek za każdym razem, gdy sekcja wjeżdża na ekran.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let armed = true;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && armed) {
          armed = false;
          burst(HAPPY, 20);
        } else if (!e.isIntersecting) armed = true;
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [burst]);

  const next = () => setShuffle({ deckKey, rotation: (rotation + 1) % deck.length });
  const prev = () => setShuffle({ deckKey, rotation: (rotation - 1 + deck.length) % deck.length });

  return (
    <section ref={section} id="recensioni" className="panel relative isolate overflow-hidden bg-notte py-(--spacing-section) text-paper">
      {/* emotki w tle */}
      <div ref={sky} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [contain:strict]" />

      <div className="container-page grid items-center gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10">
        <div>
          <HandNote rotate={-4} className="text-giallo">
            {t.reviews.kicker}
          </HandNote>
          <h2 className="sr-only">{t.reviews.heading}</h2>
          <p className="mt-2 flex items-end gap-4">
            <span className="tabular text-[clamp(6rem,17vw,12rem)] leading-[0.8] font-extrabold tracking-tighter text-giallo">{average.toLocaleString(t.lang.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            <span className="pb-3">
              <span className="block text-2xl tracking-widest text-giallo" aria-label={t.common.starsAria(Number(average.toFixed(1)))}>
                <span aria-hidden>★★★★★</span>
              </span>
              <span className="block font-bold">{t.reviews.outOf(stats.count)}</span>
            </span>
          </p>
          {examplesOnly ? <p className="mt-4 inline-block rounded-full border-2 border-paper/40 px-3 py-1 text-sm font-bold">{t.reviews.examples}</p> : null}
          <p className="mt-3 max-w-[46ch] text-sm leading-snug font-semibold opacity-70">{t.reviews.disclosure}</p>

          <Reactions burst={burst} />
          <ReviewForm burst={burst} onSent={reload} />
        </div>

        <div>
          <div className="relative mx-auto h-[26rem] w-full max-w-[26rem] sm:h-[28rem]">
            {!loaded ? (
              <div aria-hidden className="absolute inset-0 animate-pulse rounded-[2rem] border-[2.5px] border-paper/20 bg-paper/10" />
            ) : null}
            <AnimatePresence initial={false}>
              {(loaded ? order.slice(0, 3) : []).map((reviewIndex, depth) => (
                <Card
                  key={deck[reviewIndex].key}
                  review={deck[reviewIndex]}
                  tone={TONES[reviewIndex % TONES.length]}
                  depth={depth}
                  onThrow={(dir) => {
                    if (dir > 0) burst(["❤️", "😍", "💛"], 10, { x: 60 });
                    next();
                  }}
                />
              ))}
            </AnimatePresence>
          </div>

          <div className="mt-8 flex items-center justify-center gap-4">
            <button type="button" onClick={prev} aria-label={t.reviews.prev} className="btn-3d flex size-14 items-center justify-center rounded-full bg-paper text-ink">
              <Arrow flip />
            </button>
            <p className="tabular min-w-16 text-center font-extrabold" aria-live="polite">
              {order[0] + 1} / {deck.length}
            </p>
            <button type="button" onClick={next} aria-label={t.reviews.next} className="btn-3d flex size-14 items-center justify-center rounded-full bg-giallo text-ink">
              <Arrow />
            </button>
          </div>
          <HandNote rotate={2} className="mt-3 text-center text-giallo">
            {t.reviews.drag}
          </HandNote>
        </div>
      </div>

      {own.length > 10 ? <AllReviews items={own} /> : null}
    </section>
  );
}

type BurstFn = (emojis: string[], count: number, origin?: { x: number }) => void;

const REACTION_BUTTONS = [
  { kind: "amore", emoji: "❤️" },
  { kind: "buonissima", emoji: "😋" },
  { kind: "pazzesca", emoji: "🤪" },
  { kind: "fuoco", emoji: "🔥" },
] as const;

type Counts = Record<(typeof REACTION_BUTTONS)[number]["kind"], number>;

/** Szybkie reakcje z licznikami wspólnymi dla wszystkich odwiedzających. */
function Reactions({ burst }: { burst: BurstFn }) {
  const t = useT();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/reactions")
      .then((r) => r.json())
      .then((d: { reactions: Counts }) => alive && setCounts(d.reactions))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const react = (kind: keyof Counts, emoji: string, i: number) => {
    burst([emoji, emoji, "✨"], 14, { x: 10 + i * 12 });
    setCounts((c) => (c ? { ...c, [kind]: c[kind] + 1 } : c));
    fetch("/api/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { reactions: Counts } | null) => d && setCounts(d.reactions))
      .catch(() => undefined);
  };

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;

  return (
    <div className="mt-8">
      <p className="font-bold">
        {t.reviews.quick}
        {total !== null ? <span className="tabular ml-2 font-semibold opacity-70">· {t.reviews.soFar(total)}</span> : null}
      </p>
      <div className="mt-1 grid max-w-md grid-cols-2 gap-x-3 gap-y-1">
        {REACTION_BUTTONS.map(({ kind, emoji }, i) => (
          <button
            key={kind}
            type="button"
            onClick={() => react(kind, emoji, i)}
            className="btn-3d relative mt-2 mb-[6px] flex h-14 min-w-0 items-center gap-1.5 rounded-full bg-paper pr-2 pl-2.5 font-extrabold text-ink"
          >
            <span className="text-[1.4rem] leading-none">{emoji}</span>
            <span className="line-clamp-2 min-w-0 flex-1 text-left text-[0.95rem] leading-[1.05]">{t.reviews.reactions[kind]}</span>
            {/* licznik jak plakietka w rogu — cała szerokość zostaje dla napisu */}
            <span className="tabular absolute -top-2.5 -right-1 flex h-7 min-w-7 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-giallo px-1.5 text-xs">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={counts?.[kind] ?? "…"}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  {counts ? counts[kind] : "…"}
                </motion.span>
              </AnimatePresence>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const googleReviewUrl = () =>
  RESTAURANT.googlePlaceId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(RESTAURANT.googlePlaceId)}` : RESTAURANT.mapsUrl;

/**
 * „Scrivi una recensione”. 4–5★: kopiujemy tekst do schowka i otwieramy wizytówkę Google.
 * 1–3★: najpierw pytamy, co poszło nie tak (trafia do panelu admina), ale link do Google
 * i tak jest dostępny — nie blokujemy nikomu publicznej opinii.
 * Google nie pozwala z linku zaznaczyć gwiazdek, więc klient wybiera je tam jeszcze raz.
 */
function ReviewForm({ burst, onSent }: { burst: BurstFn; onSent: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [photos, setPhotos] = useState<{ file: Blob; url: string }[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "google" | "private">("idle");
  const [wave, setWave] = useState(0);
  const reducedMotion = useReducedMotion();
  // Podpowiedź bez słów: gwiazdki podskakują i zapalają się falą, a potem gasną od końca.
  const waveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeStars = () => {
    if (reducedMotion) return;
    setWave((w) => w + 1);
    // po fali gwiazdki wracają do zwykłego podświetlania (najechanie, wybór)
    if (waveTimer.current) clearTimeout(waveTimer.current);
    waveTimer.current = setTimeout(() => setWave(0), WAVE_S * 1000 + 60);
  };
  useEffect(() => () => {
    if (waveTimer.current) clearTimeout(waveTimer.current);
  }, []);
  const [error, setError] = useState("");
  const shown = hover || rating;
  const happy = rating >= 4;

  const send = () => {
    const form = new FormData();
    form.set("rating", String(rating));
    form.set("text", text);
    form.set("name", name);
    form.set("email", email);
    form.set("lang", lang);
    photos.forEach((p, i) => form.append("photos", p.file, `foto-${i + 1}.jpg`));
    return fetch("/api/feedback", { method: "POST", body: form });
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = 3 - photos.length;
    const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
    const shrunk = await Promise.all(picked.map(shrinkPhoto));
    setPhotos((list) => [...list, ...shrunk.filter((p): p is Blob => Boolean(p)).map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 3));
  };

  // podglądy zwalniamy przy usunięciu zdjęcia i przy odmontowaniu formularza
  const previews = useRef(photos);
  useEffect(() => {
    previews.current = photos;
  }, [photos]);
  useEffect(() => () => previews.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      nudgeStars();
      return setError(t.reviews.pickFirst);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError(t.errors.email);
    setError("");

    // Najpierw zapis u nas (z e-mailem i zdjęciami) — dopiero potem zaproszenie na Google.
    setState("sending");
    const res = await send().catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? t.reviews.failed);
      setState("idle");
      return;
    }
    onSent();

    if (happy) {
      try {
        if (text) await navigator.clipboard.writeText(text);
      } catch {
        /* schowek niedostępny — klient przepisze */
      }
      setState("google");
      burst(["⭐", "❤️", "🥳"], 18, { x: 20 });
      return;
    }
    setState("private");
  };

  if (state === "google" || state === "private") {
    return (
      <div className="mt-8 rounded-[2rem] border-[2.5px] border-ink bg-paper p-6 text-ink shadow-[0_8px_0_var(--color-giallo)]" role="status">
        {state === "google" ? (
          <>
            <p className="text-2xl font-extrabold">{t.reviews.thanksHappy}</p>
            <p className="mt-2 font-semibold">
              {t.reviews.thanksMailHappy(name || t.reviews.anonymous)}
            </p>
            {photos.length ? <p className="mt-2 text-sm font-semibold opacity-75">{t.reviews.photoWait}</p> : null}
            <a href={googleReviewUrl()} target="_blank" rel="noreferrer" className="btn-3d mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-giallo px-5 font-bold">
              <GoogleMark />
              {t.reviews.thanksMailGoogle}
            </a>
          </>
        ) : (
          <>
            <p className="text-2xl font-extrabold">{t.reviews.thanksSad}</p>
            <p className="mt-2 font-semibold">{t.reviews.thanksSadText}</p>
            <a href={googleReviewUrl()} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-bold underline underline-offset-4">
              {t.reviews.publishToo}
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 rounded-[2rem] border-[2.5px] border-ink bg-paper p-5 text-ink shadow-[0_8px_0_var(--color-giallo)] sm:p-6">
      <p className="text-2xl font-extrabold tracking-tight">{t.reviews.leave}</p>

      <div role="radiogroup" aria-label={t.reviews.starsLabel} className="mt-3 flex gap-1" onPointerLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t.reviews.star(n)}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHover(n)}
            onClick={() => {
              setHover(0);
              setRating(n);
            }}
            className={`text-[2.6rem] leading-none transition-[scale,color] duration-150 [@media(hover:hover)]:hover:scale-125 ${n <= shown ? "text-giallo [text-shadow:0_3px_0_var(--color-ink)]" : "text-ink/20"}`}
          >
            {wave && !rating ? <WaveStar key={wave} index={n - 1} /> : "★"}
          </button>
        ))}
      </div>

      <label className="mt-4 grid gap-1.5">
        <span className="font-bold">{rating && rating <= 3 ? t.reviews.wrong : t.reviews.how}</span>
        <textarea
          value={text}
          onChange={(e) => {
            // pierwsza litera bez wybranej oceny → fala gwiazdek
            if (!rating && !text && e.target.value) nudgeStars();
            setText(e.target.value);
          }}
          rows={3}
          maxLength={1000}
          placeholder={t.reviews.placeholder}
          className="resize-none rounded-2xl border-[2.5px] border-ink bg-paper px-4 py-3 font-semibold placeholder:text-ink/45"
        />
      </label>
      {/* zdjęcia: zmniejszane w przeglądarce do ~1600 px, najwyżej 3 */}
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          {photos.map((p, i) => (
            <span key={p.url} className="relative size-16 overflow-hidden rounded-xl border-[2.5px] border-ink">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="size-full object-cover" />
              <button
                type="button"
                aria-label={t.reviews.removePhoto}
                onClick={() => {
                  URL.revokeObjectURL(p.url);
                  setPhotos((list) => list.filter((_, k) => k !== i));
                }}
                className="absolute top-0.5 right-0.5 flex size-6 items-center justify-center rounded-full bg-ink text-sm leading-none font-bold text-paper"
              >
                ×
              </button>
            </span>
          ))}
          {photos.length < 3 ? (
            <label className="btn-3d btn-3d-sm flex h-16 cursor-pointer items-center gap-2 rounded-xl bg-paper px-4 font-bold">
              <CameraIcon />
              <span className="leading-tight">
                <span className="block">{t.reviews.photos}</span>
                <span className="block text-xs font-semibold opacity-70">{t.reviews.photosNote}</span>
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="font-bold">{t.reviews.name}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" className="h-12 rounded-2xl border-[2.5px] border-ink bg-paper px-4 font-semibold" />
        </label>
        <label className="grid gap-1.5">
          <span className="font-bold">{t.reviews.email}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
            autoComplete="email"
            className="h-12 rounded-2xl border-[2.5px] border-ink bg-paper px-4 font-semibold"
          />
        </label>
      </div>
      <p className="font-hand mt-1 text-lg leading-tight">{t.reviews.emailNote}</p>

      {error ? (
        <p className="mt-3 font-bold text-pomodoro" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={state === "sending"} className={`btn-3d mt-5 flex h-14 w-full items-center justify-center rounded-full text-lg font-extrabold ${rating ? "bg-giallo" : "bg-ink text-paper"}`}>
        {state === "sending" ? t.reviews.sending : !rating ? t.reviews.chooseStars : `${t.reviews.leave} ⭐`}
      </button>
    </form>
  );
}

function Card({ review, tone, depth, onThrow }: { review: DeckReview; tone: string; depth: number; onThrow: (dir: number) => void }) {
  const t = useT();
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const isTop = depth === 0;
  const tilt = [0, 5, -6][depth];

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dir = Math.sign(info.offset.x || info.velocity.x);
    if (Math.abs(info.offset.x) > 110 || Math.abs(info.velocity.x) > 600) {
      animate(x, dir * 700, { duration: 0.35, ease: [0.3, 0, 0.6, 1] }).then(() => onThrow(dir));
    } else {
      animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
    }
  };

  return (
    <motion.figure
      className={`absolute inset-0 flex flex-col rounded-[2rem] border-[2.5px] border-ink p-7 text-ink shadow-[0_8px_0_var(--color-ink)] sm:p-8 ${tone} ${
        isTop ? "cursor-grab touch-pan-y active:cursor-grabbing" : "pointer-events-none"
      }`}
      style={{ x: isTop ? x : 0, rotate: isTop ? rotate : tilt, zIndex: 10 - depth }}
      drag={isTop && !reduced ? "x" : false}
      dragSnapToOrigin={false}
      onDragEnd={onDragEnd}
      initial={reduced ? false : { scale: 0.85, y: 40, opacity: 0 }}
      animate={{ scale: 1 - depth * 0.05, y: depth * 18, opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      aria-hidden={!isTop}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xl tracking-widest" aria-label={t.common.starsAria(review.rating)}>
          <span aria-hidden>
            {"★".repeat(review.rating)}
            <span className="opacity-25">{"★".repeat(5 - review.rating)}</span>
          </span>
        </p>
        {review.example ? (
          <span className="font-hand rotate-3 text-xl">{t.common.example}</span>
        ) : review.google !== undefined ? (
          <span className="flex rotate-3 items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 text-xs font-extrabold">
            <GoogleMark /> {t.reviews.google}
          </span>
        ) : review.verified ? (
          <span className="rotate-3 rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 text-xs font-extrabold">✓ {t.reviews.verified}</span>
        ) : null}
      </div>
      <blockquote
        className={`mt-5 flex-1 overflow-hidden leading-[1] font-extrabold tracking-tight ${
          review.photos.length ? "line-clamp-4 text-[clamp(1.3rem,3.6vw,1.8rem)]" : review.quote.length > 140 ? "line-clamp-7 text-[clamp(1.2rem,3.4vw,1.6rem)]" : "text-[clamp(1.6rem,4.6vw,2.3rem)]"
        }`}
      >
        &ldquo;{review.quote}&rdquo;
      </blockquote>
      {review.photos.length ? (
        <div className="mt-4 flex gap-2">
          {review.photos.slice(0, 3).map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" loading="lazy" draggable={false} className="h-24 min-w-0 flex-1 rounded-xl border-[2.5px] border-ink object-cover" />
          ))}
        </div>
      ) : null}
      <figcaption className="mt-6 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full border-[2.5px] border-ink bg-paper text-xl font-extrabold">{review.author[0]}</span>
        <span className="font-hand text-2xl">{review.author}</span>
      </figcaption>
    </motion.figure>
  );
}

function Arrow({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-6 ${flip ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12h15M13 5.5l6.5 6.5-6.5 6.5" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3v11H4Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/** Znak „G” w kolorach Google — oznaczenie źródła opinii, wymagane przy treściach z Google. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7H2.1a11 11 0 0 0 0 9.9l3.7-2.7Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

const STAR_DIM = "rgba(18, 12, 8, 0.2)";
const STAR_LIT = "#ffcf3f";
const WAVE_S = 1.15;

/**
 * Jedna gwiazdka fali: po kolei od pierwszej podskakuje i zapala się (zapalone zostają),
 * a potem gasną od ostatniej do pierwszej. Czasy w sekundach, przeliczane na ułamki trwania.
 */
function WaveStar({ index }: { index: number }) {
  const up = 0.04 + index * 0.075;
  const off = 0.62 + (4 - index) * 0.08;
  const f = (sec: number) => Math.min(1, sec / WAVE_S);
  return (
    <motion.span
      className="inline-block"
      initial={{ y: 0, scale: 1, color: STAR_DIM, textShadow: "0 0px 0 rgba(18,12,8,0)" }}
      animate={{
        y: [0, 0, -16, 0, 0],
        scale: [1, 1, 1.28, 1, 1],
        color: [STAR_DIM, STAR_DIM, STAR_LIT, STAR_LIT, STAR_DIM, STAR_DIM],
        textShadow: ["0 0px 0 rgba(18,12,8,0)", "0 0px 0 rgba(18,12,8,0)", "0 3px 0 rgba(18,12,8,1)", "0 3px 0 rgba(18,12,8,1)", "0 0px 0 rgba(18,12,8,0)", "0 0px 0 rgba(18,12,8,0)"],
      }}
      transition={{
        duration: WAVE_S,
        y: { duration: WAVE_S, times: [0, f(up), f(up + 0.1), f(up + 0.24), 1], ease: "easeOut" },
        scale: { duration: WAVE_S, times: [0, f(up), f(up + 0.1), f(up + 0.24), 1] },
        color: { duration: WAVE_S, times: [0, f(up), f(up + 0.06), f(off), f(off + 0.08), 1] },
        textShadow: { duration: WAVE_S, times: [0, f(up), f(up + 0.06), f(off), f(off + 0.08), 1] },
      }}
    >
      ★
    </motion.span>
  );
}

type RatingFilter = "all" | 5 | 4 | "low";

/**
 * „Zobacz wszystkie”: rozwijana lista wszystkich opinii (ze strony i z Google) z filtrami
 * po gwiazdkach, zdjęciach, zweryfikowanym zamówieniu i źródle oraz sortowaniem.
 * Pokazuje po 12 i dokłada kolejne na żądanie.
 */
function AllReviews({ items }: { items: DeckReview[] }) {
  const t = useT();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState<RatingFilter>("all");
  const [photos, setPhotos] = useState(false);
  const [verified, setVerified] = useState(false);
  const [google, setGoogle] = useState(false);
  const [sort, setSort] = useState<"new" | "best">("new");
  const [limit, setLimit] = useState(12);

  const filtered = items
    .filter((r) => (stars === "all" ? true : stars === "low" ? r.rating <= 3 : r.rating === stars))
    .filter((r) => !photos || r.photos.length > 0)
    .filter((r) => !verified || r.verified)
    .filter((r) => !google || r.google !== undefined)
    .sort((a, b) => (sort === "best" ? b.rating - a.rating : (b.createdAt ?? "").localeCompare(a.createdAt ?? "")));
  const shown = filtered.slice(0, limit);

  const chip = (on: boolean) => `btn-3d btn-3d-sm h-10 rounded-full px-4 text-sm font-extrabold ${on ? "bg-giallo text-ink" : "bg-paper text-ink"}`;

  return (
    <div className="container-page mt-14">
      <div className="flex justify-center">
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="btn-3d flex h-14 items-center gap-3 rounded-full bg-paper px-6 text-lg font-extrabold text-ink">
          {open ? t.reviews.hideAll : t.reviews.seeAll(items.length)}
          <motion.svg animate={{ rotate: open ? 180 : 0 }} viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </motion.svg>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="all"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12, transition: { duration: 0.2 } }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8"
          >
            {/* filtry wysuwają się falą */}
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {(
                [
                  ["all", t.reviews.filterAll],
                  [5, "5★"],
                  [4, "4★"],
                  ["low", t.reviews.filterLow],
                ] as [RatingFilter, string][]
              ).map(([value, label], i) => (
                <motion.button
                  key={String(value)}
                  type="button"
                  aria-pressed={stars === value}
                  onClick={() => {
                    setStars(value);
                    setLimit(12);
                  }}
                  initial={reduced ? false : { opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.04 * i }}
                  className={chip(stars === value)}
                >
                  {label}
                </motion.button>
              ))}
              <span aria-hidden className="mx-1 hidden h-6 w-0.5 rounded bg-paper/30 sm:block" />
              {(
                [
                  [photos, setPhotos, t.reviews.filterPhotos],
                  [verified, setVerified, t.reviews.filterVerified],
                  [google, setGoogle, "Google"],
                ] as [boolean, (v: boolean) => void, string][]
              ).map(([on, set, label], i) => (
                <motion.button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    set(!on);
                    setLimit(12);
                  }}
                  initial={reduced ? false : { opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.16 + 0.04 * i }}
                  className={chip(on)}
                >
                  {label}
                </motion.button>
              ))}
            </div>
            <div className="mt-3 flex justify-center gap-2">
              {(
                [
                  ["new", t.reviews.sortNew],
                  ["best", t.reviews.sortBest],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sort === value}
                  onClick={() => setSort(value)}
                  className={`h-9 rounded-full px-4 text-sm font-bold underline-offset-4 ${sort === value ? "text-giallo underline decoration-2" : "text-paper/70"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <p className="mt-10 text-center text-lg font-bold text-paper/70">{t.reviews.filterNone}</p>
            ) : (
              <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {shown.map((r, i) => (
                  <motion.li
                    key={r.key}
                    initial={reduced ? false : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, 8) * 0.03 }}
                    className="flex flex-col rounded-[1.5rem] border-[2.5px] border-ink bg-paper p-5 text-ink shadow-[0_6px_0_var(--color-ink)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xl tracking-widest" aria-label={t.common.starsAria(r.rating)}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span key={n} aria-hidden className={n <= r.rating ? "text-[#f0a81c]" : "text-ink/15"}>
                            ★
                          </span>
                        ))}
                      </p>
                      {r.google !== undefined ? (
                        <span className="flex items-center gap-1 rounded-full border-2 border-ink px-2 py-0.5 text-xs font-extrabold">
                          <GoogleMark /> Google
                        </span>
                      ) : r.verified ? (
                        <span className="rounded-full bg-menta px-2 py-0.5 text-xs font-extrabold">✓ {t.reviews.verified}</span>
                      ) : null}
                    </div>
                    <p className="mt-3 flex-1 leading-snug font-semibold">&ldquo;{r.quote}&rdquo;</p>
                    {r.photos.length ? (
                      <div className="mt-3 flex gap-2">
                        {r.photos.map((src) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={src} src={src} alt="" loading="lazy" className="h-20 min-w-0 flex-1 rounded-xl border-2 border-ink object-cover" />
                        ))}
                      </div>
                    ) : null}
                    <p className="font-hand mt-3 text-xl">{r.author}</p>
                  </motion.li>
                ))}
              </ul>
            )}

            {filtered.length > shown.length ? (
              <div className="mt-8 flex justify-center">
                <button type="button" onClick={() => setLimit((n) => n + 12)} className="btn-3d flex h-12 items-center rounded-full bg-giallo px-6 font-extrabold text-ink">
                  {t.reviews.showMore} ({filtered.length - shown.length})
                </button>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
