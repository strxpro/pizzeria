"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ArtKey } from "@/lib/data";
import { euro } from "@/lib/format";
import type { MenuCategoryRecord, MenuItemRecord } from "@/lib/server/menu";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { ART, PizzaArt } from "./pizza-art";

const TAGS = ["", "Più amata", "Piccante", "Vegetariana", "Novità"] as const;
const ARTS: { key: ArtKey | ""; label: string }[] = [
  { key: "", label: "Nessuna" },
  { key: "margherita", label: "Margherita" },
  { key: "marinara", label: "Marinara" },
  { key: "diavola", label: "Diavola" },
  { key: "capricciosa", label: "Capricciosa" },
  { key: "funghi", label: "Funghi" },
  { key: "quattro", label: "4 formaggi" },
  { key: "bufalina", label: "Bufalina" },
  { key: "tartufo", label: "Tartufo" },
  { key: "nduja", label: "Nduja" },
  { key: "mortadella", label: "Mortadella" },
];

type Db = { categories: MenuCategoryRecord[]; items: MenuItemRecord[] };
type Draft = { id: string | null; category: string };

/**
 * Zakładka „Menu” w panelu (po włosku): kategorie z produktami, szybki przełącznik dostępności,
 * kolejność strzałkami, edytor produktu ze zdjęciem (zmniejszanym w przeglądarce) i rysunkiem pizzy.
 * Zmiany widać na stronie po odświeżeniu — serwer zamówień bierze ceny z tego samego magazynu.
 */
export function AdminMenu({ adminFetch }: { adminFetch: (url: string, init?: RequestInit) => Promise<Response> }) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  // Kategorie jak akordeon — na start wszystkie zwinięte, stuknięcie w nagłówek rozwija.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const load = useCallback(async () => {
    const res = await adminFetch("/api/admin/menu").catch(() => null);
    if (res?.ok) setDb((await res.json()) as Db);
  }, [adminFetch]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const call = async (url: string, init: RequestInit) => {
    setError("");
    const res = await adminFetch(url, init).catch(() => null);
    if (!res?.ok) setError(((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "Qualcosa è andato storto.");
    await load();
    return Boolean(res?.ok);
  };

  if (!db) return <p className="py-20 text-center font-bold text-ink/60">Caricamento…</p>;

  const editing = draft?.id ? db.items.find((i) => i.id === draft.id) ?? null : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">Menu</h2>
          <p className="text-sm font-semibold text-ink/60">
            {db.items.length} prodotti · {db.items.filter((i) => i.available === false).length} non disponibili
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft({ id: null, category: db.categories[0]?.id ?? "" })}
          className="flex h-12 items-center gap-2 rounded-full border-2 border-ink bg-pomodoro px-5 font-extrabold shadow-[0_4px_0_var(--color-ink)] transition-[translate,box-shadow] active:translate-y-1 active:shadow-none"
        >
          <span className="text-xl leading-none">+</span> Aggiungi prodotto
        </button>
      </div>
      {error ? <p className="mt-3 rounded-2xl bg-rosa px-4 py-2.5 font-bold">{error}</p> : null}

      <div className="mt-6 grid grid-cols-1 gap-3">
        {db.categories.map((c, ci) => {
          const items = db.items.filter((i) => i.category === c.id);
          const off = items.filter((i) => i.available === false).length;
          const expanded = open.has(c.id);
          return (
            <section key={c.id} className="min-w-0 overflow-hidden rounded-3xl border-2 border-ink bg-paper">
              <header className={`flex items-center gap-2 py-2 pr-3 pl-2 transition-colors ${expanded ? "border-b-2 border-ink/10 bg-giallo/40" : ""}`}>
                {renaming?.id === c.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await call(`/api/admin/menu/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ label: renaming.label }) })) setRenaming(null);
                    }}
                  >
                    <input autoFocus value={renaming.label} onChange={(e) => setRenaming({ id: c.id, label: e.target.value })} className="h-10 min-w-0 flex-1 rounded-xl border-2 border-ink px-3 font-bold" />
                    <button className="h-10 rounded-xl bg-ink px-3 text-sm font-bold text-paper">Salva</button>
                  </form>
                ) : (
                  <button type="button" aria-expanded={expanded} onClick={() => toggle(c.id)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 text-left">
                    <motion.svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" animate={{ rotate: expanded ? 90 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 34 }} aria-hidden>
                      <path d="M9 5l7 7-7 7" />
                    </motion.svg>
                    <span className="min-w-0">
                      <span className="block truncate text-xl leading-tight font-extrabold">{c.label}</span>
                      <span className="block text-xs font-bold text-ink/55">
                        {items.length} prodotti{off ? ` · ${off} non disponibili` : ""}
                      </span>
                    </span>
                  </button>
                )}
                <div className={`shrink-0 gap-1 ${expanded || renaming?.id === c.id ? "flex" : "hidden sm:flex"}`}>
                  <IconButton label="Sposta su" disabled={ci === 0} onClick={() => call(`/api/admin/menu/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ move: -1 }) })}>
                    ↑
                  </IconButton>
                  <IconButton label="Sposta giù" disabled={ci === db.categories.length - 1} onClick={() => call(`/api/admin/menu/categories/${c.id}`, { method: "PATCH", body: JSON.stringify({ move: 1 }) })}>
                    ↓
                  </IconButton>
                  <IconButton label="Rinomina" onClick={() => setRenaming({ id: c.id, label: c.label })}>
                    ✎
                  </IconButton>
                  {items.length === 0 ? (
                    <IconButton label="Elimina categoria" onClick={() => call(`/api/admin/menu/categories/${c.id}`, { method: "DELETE" })}>
                      ×
                    </IconButton>
                  ) : null}
                </div>
              </header>

              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div key="list" initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
              <ul className="divide-y-2 divide-ink/5">
                {items.map((item, ii) => (
                  <motion.li key={item.id} layout="position" className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${item.available === false ? "opacity-55" : ""}`}>
                    <Thumb item={item} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold">{item.name}</p>
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className="tabular font-extrabold">{euro(item.price)}</span>
                        {item.tag ? <span className="truncate rounded-full bg-giallo px-2 text-xs font-bold">{item.tag}</span> : null}
                      </p>
                      <p className="truncate text-xs font-semibold text-ink/55">{item.description}</p>
                    </div>
                    <div className="hidden gap-1 sm:flex">
                      <IconButton label="Sposta su" disabled={ii === 0} onClick={() => call(`/api/admin/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ move: -1 }) })}>
                        ↑
                      </IconButton>
                      <IconButton label="Sposta giù" disabled={ii === items.length - 1} onClick={() => call(`/api/admin/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ move: 1 }) })}>
                        ↓
                      </IconButton>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                      <Switch
                        on={item.available !== false}
                        label={item.available === false ? "Non disponibile" : "Disponibile"}
                        onChange={(on) => call(`/api/admin/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ available: on }) })}
                      />
                      <button type="button" onClick={() => setDraft({ id: item.id, category: item.category })} className="h-8 rounded-full border-2 border-ink px-3 text-xs font-bold sm:h-10 sm:px-4 sm:text-sm">
                        Modifica
                      </button>
                    </div>
                  </motion.li>
                ))}
                <li className="px-4 py-3">
                  <button type="button" onClick={() => setDraft({ id: null, category: c.id })} className="text-sm font-bold text-ink/60 underline underline-offset-2">
                    + Aggiungi a {c.label}
                  </button>
                </li>
              </ul>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>
          );
        })}
      </div>

      <form
        className="mt-6 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call("/api/admin/menu", { method: "POST", body: JSON.stringify({ category: newCategory }) })) setNewCategory("");
        }}
      >
        <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nuova categoria (es. Fritti)" className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-ink bg-paper px-4 font-semibold" />
        <button className="h-12 rounded-2xl bg-ink px-5 font-bold text-paper">Crea</button>
      </form>

      <AnimatePresence>
        {draft ? (
          <ItemEditor
            key={draft.id ?? "new"}
            item={editing}
            category={draft.category}
            categories={db.categories}
            adminFetch={adminFetch}
            onClose={() => setDraft(null)}
            onSaved={async () => {
              setDraft(null);
              await load();
            }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function ItemEditor({
  item,
  category,
  categories,
  adminFetch,
  onClose,
  onSaved,
}: {
  item: MenuItemRecord | null;
  category: string;
  categories: MenuCategoryRecord[];
  adminFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const reduced = useReducedMotion();
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [art, setArt] = useState<string>(item?.art ?? "");
  const [cat, setCat] = useState(item?.category ?? category);
  const [tag, setTag] = useState<string>(item?.tag ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  const currentPhoto = photo?.url ?? (removePhoto ? null : (item?.photo ?? null));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    form.set("art", art);
    form.set("category", cat);
    form.set("tag", tag);
    form.set("available", form.get("available") === "on" ? "true" : "false");
    if (photo) form.set("photo", photo.blob, "foto.jpg");
    else form.delete("photo");
    if (removePhoto && !photo) form.set("removePhoto", "true");
    const res = await adminFetch(item ? `/api/admin/menu/items/${item.id}` : "/api/admin/menu", { method: item ? "PATCH" : "POST", body: form, headers: {} }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "Salvataggio non riuscito.");
    onSaved();
  };

  const remove = async () => {
    if (!item) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    const res = await adminFetch(`/api/admin/menu/items/${item.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("Eliminazione non riuscita.");
    onSaved();
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-ink/50" />
      <motion.form
        onSubmit={submit}
        initial={reduced ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="relative flex max-h-[92svh] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-t-3xl border-2 border-b-0 border-ink bg-paper sm:max-h-[88svh] sm:rounded-3xl sm:border-b-2"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-ink/10 px-5 py-3">
          <h3 className="text-2xl font-extrabold">{item ? "Modifica prodotto" : "Nuovo prodotto"}</h3>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="flex size-10 items-center justify-center rounded-full border-2 border-ink text-xl font-bold">
            ×
          </button>
        </div>

        <div data-lenis-prevent className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pt-4 pb-5">
        {/* foto */}
        <div className="flex items-center gap-4">
          <div className="relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-ink bg-[#f6f0e4]">
            {currentPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentPhoto} alt="" className="size-full object-cover" />
            ) : art ? (
              <PizzaArt {...ART[art]} className="w-[85%]" />
            ) : (
              <span className="text-sm font-bold text-ink/40">Nessuna foto</span>
            )}
          </div>
          <div className="grid gap-2">
            <label className="flex h-11 cursor-pointer items-center justify-center rounded-full bg-ink px-4 text-sm font-bold text-paper">
              {currentPhoto ? "Cambia foto" : "Carica foto"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const blob = await shrinkPhoto(file, 1400);
                  if (!blob) return setError("Foto troppo pesante.");
                  setPhoto({ blob, url: URL.createObjectURL(blob) });
                  setRemovePhoto(false);
                }}
              />
            </label>
            {currentPhoto ? (
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  setRemovePhoto(true);
                }}
                className="text-sm font-bold text-ink/60 underline underline-offset-2"
              >
                Rimuovi foto
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="Nome">
            <input name="name" required defaultValue={item?.name} maxLength={60} className={INPUT} />
          </Field>
          <Field label="Descrizione">
            <textarea name="description" defaultValue={item?.description} maxLength={200} rows={2} className={`${INPUT} h-auto resize-none py-2.5`} />
          </Field>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Prezzo (€)">
              <input name="price" required inputMode="decimal" defaultValue={item ? String(item.price).replace(".", ",") : ""} placeholder="8,50" className={INPUT} />
            </Field>
            <label className="flex h-12 items-center gap-3 rounded-xl border-2 border-ink/15 px-3 text-sm font-bold">
              <input type="checkbox" name="available" defaultChecked={item?.available !== false} className="size-5 shrink-0 accent-ink" />
              Disponibile
            </label>
          </div>
          <Group label="Categoria">
            {categories.map((c) => (
              <Chip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}>
                {c.label}
              </Chip>
            ))}
          </Group>
          <Group label="Etichetta">
            {TAGS.map((t) => (
              <Chip key={t} on={tag === t} onClick={() => setTag(t)}>
                {t || "Nessuna"}
              </Chip>
            ))}
          </Group>
          <div className="grid min-w-0 gap-1.5">
            <p className="text-sm font-bold">Disegno pizza</p>
            {/* przewijany rząd miniatur — mieści się w szerokości okna */}
            <div role="radiogroup" aria-label="Disegno pizza" className="-mx-5 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-5 pb-1 [scrollbar-width:none]">
              {ARTS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  role="radio"
                  aria-checked={art === a.key}
                  onClick={() => setArt(a.key)}
                  className={`flex w-[4.75rem] shrink-0 snap-start flex-col items-center gap-1 rounded-2xl border-2 p-1.5 text-[0.7rem] leading-tight font-bold transition-colors ${art === a.key ? "border-ink bg-giallo" : "border-ink/15"}`}
                >
                  <span className="flex size-12 items-center justify-center">{a.key ? <PizzaArt {...ART[a.key]} className="w-full" /> : <span className="text-lg text-ink/30">—</span>}</span>
                  <span className="w-full truncate text-center">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? <p className="mt-3 rounded-xl bg-rosa px-3 py-2 font-bold">{error}</p> : null}
        </div>

        {/* przyciski zawsze na dole okna, nad paskiem telefonu */}
        <div className="grid shrink-0 gap-2 border-t-2 border-ink/10 bg-paper px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button disabled={busy} className="h-14 rounded-2xl border-2 border-ink bg-basilico text-lg font-extrabold shadow-[0_4px_0_var(--color-ink)] transition-[translate,box-shadow] active:translate-y-1 active:shadow-none disabled:opacity-50">
            {busy ? "Salvataggio…" : "Salva"}
          </button>
          {item ? (
            <button type="button" disabled={busy} onClick={remove} className={`h-11 rounded-2xl border-2 font-bold ${confirmDelete ? "border-ink bg-pomodoro" : "border-ink/20 text-ink/60"}`}>
              {confirmDelete ? "Conferma: elimina definitivamente" : "Elimina prodotto"}
            </button>
          ) : null}
        </div>
      </motion.form>
    </motion.div>
  );
}

const INPUT = "h-12 w-full rounded-xl border-2 border-ink bg-paper px-3 font-semibold";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-bold">
      {label}
      {children}
    </label>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid min-w-0 gap-1.5">
      <p className="text-sm font-bold">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className={`h-10 max-w-full truncate rounded-full border-2 px-4 text-sm font-bold transition-colors ${on ? "border-ink bg-ink text-paper" : "border-ink/20 bg-paper"}`}>
      {children}
    </button>
  );
}

function Thumb({ item }: { item: MenuItemRecord }) {
  return (
    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-ink/15 bg-[#f6f0e4]">
      {item.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo} alt="" className="size-full object-cover" />
      ) : item.art ? (
        <PizzaArt {...ART[item.art]} className="w-[88%]" />
      ) : (
        <span className="text-xs font-bold text-ink/30">—</span>
      )}
    </span>
  );
}

function IconButton({ label, disabled = false, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex size-9 items-center justify-center rounded-full border-2 border-ink/20 font-bold disabled:opacity-30">
      {children}
    </button>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors ${on ? "bg-basilico" : "bg-ink/15"}`}>
      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 32 }} className={`absolute top-0.5 size-5 rounded-full bg-paper shadow ${on ? "right-0.5" : "left-0.5"}`} />
    </button>
  );
}
