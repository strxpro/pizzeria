import { randomBytes } from "node:crypto";
import { MENU, type ArtKey, type MenuCategory, type MenuItem } from "../data";
import { jsonStore } from "./json-store";

/**
 * Menu edytowane z panelu admina, w `.data/menu.json`. Przy pierwszym odczycie wypełnia się
 * menu z kodu (`MENU` w data.ts). Strona i serwer zamówień czytają stąd — ceny zawsze z magazynu.
 * Odpowiednik w bazie: tabele `menu_categories` i `menu_items` (supabase/migrations).
 */
export type MenuItemRecord = MenuItem & { category: string; position: number };
export type MenuCategoryRecord = { id: string; label: string; position: number };
export type MenuDb = { categories: MenuCategoryRecord[]; items: MenuItemRecord[] };

const TAGS = ["Piccante", "Vegetariana", "Novità", "Più amata"] as const;
const ARTS: ArtKey[] = ["margherita", "marinara", "diavola", "capricciosa", "funghi", "quattro", "bufalina", "tartufo", "nduja", "mortadella"];

const seed = (): MenuDb => ({
  categories: MENU.map((c, i) => ({ id: c.id, label: c.label, position: i })),
  items: MENU.flatMap((c) => c.items.map((item, i) => ({ ...item, category: c.id, position: i, photo: null, available: true }))),
});

const store = jsonStore<MenuDb>("menu.json", seed);

export class MenuError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const slug = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "prodotto";

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/** Menu dla strony: kategorie z dostępnymi pozycjami, w ustalonej kolejności. */
export async function publicMenu(): Promise<MenuCategory[]> {
  const db = await store.read();
  return [...db.categories].sort(byPosition).map((c) => ({
    id: c.id,
    label: c.label,
    items: db.items
      .filter((i) => i.category === c.id && i.available !== false)
      .sort(byPosition)
      .map((i): MenuItem => ({ id: i.id, name: i.name, description: i.description, price: i.price, art: i.art, tag: i.tag, photo: i.photo ?? null, available: true })),
  }));
}

/** Pełne menu dla admina (także niedostępne pozycje). */
export async function adminMenu() {
  const db = await store.read();
  return { categories: [...db.categories].sort(byPosition), items: [...db.items].sort(byPosition) };
}

/** Pozycja do zamówienia — tylko dostępna, z ceną z magazynu. */
export async function orderableItems() {
  const db = await store.read();
  return db.items.filter((i) => i.available !== false);
}

export type ItemInput = {
  name?: unknown;
  description?: unknown;
  price?: unknown;
  category?: unknown;
  tag?: unknown;
  art?: unknown;
  available?: unknown;
};

function parseItem(input: ItemInput, db: MenuDb) {
  const name = str(input.name, 60);
  if (name.length < 2) throw new MenuError("Inserisci il nome del prodotto.");
  const price = Math.round(Number(String(input.price ?? "").replace(",", ".")) * 100) / 100;
  if (!Number.isFinite(price) || price < 0 || price > 999) throw new MenuError("Prezzo non valido.");
  const category = str(input.category, 40);
  if (!db.categories.some((c) => c.id === category)) throw new MenuError("Categoria non valida.");
  const tag = TAGS.find((t) => t === input.tag);
  const art = ARTS.find((a) => a === input.art);
  return {
    name,
    description: str(input.description, 200),
    price,
    category,
    tag,
    art,
    available: input.available === undefined ? true : input.available === true || input.available === "true",
  };
}

export async function createItem(input: ItemInput, photo: string | null) {
  return store.mutate((db) => {
    const data = parseItem(input, db);
    let id = slug(data.name);
    if (db.items.some((i) => i.id === id)) id = `${id}-${randomBytes(2).toString("hex")}`;
    const position = Math.max(-1, ...db.items.filter((i) => i.category === data.category).map((i) => i.position)) + 1;
    const item: MenuItemRecord = { id, ...data, photo, position };
    db.items.push(item);
    return item;
  });
}

export async function updateItem(id: string, input: ItemInput, photo: { set: string | null } | null) {
  return store.mutate((db) => {
    const item = db.items.find((i) => i.id === id);
    if (!item) throw new MenuError("Prodotto non trovato.", 404);
    const data = parseItem({ ...item, ...input }, db);
    if (data.category !== item.category) {
      item.position = Math.max(-1, ...db.items.filter((i) => i.category === data.category).map((i) => i.position)) + 1;
    }
    Object.assign(item, data);
    if (photo) item.photo = photo.set;
    return item;
  });
}

export async function deleteItem(id: string) {
  return store.mutate((db) => {
    const before = db.items.length;
    db.items = db.items.filter((i) => i.id !== id);
    if (db.items.length === before) throw new MenuError("Prodotto non trovato.", 404);
  });
}

/** Przesunięcie o jedno miejsce w górę (-1) albo w dół (1) w swojej kategorii. */
export async function moveItem(id: string, dir: number) {
  return store.mutate((db) => {
    const item = db.items.find((i) => i.id === id);
    if (!item) throw new MenuError("Prodotto non trovato.", 404);
    const siblings = db.items.filter((i) => i.category === item.category).sort(byPosition);
    siblings.forEach((s, i) => (s.position = i));
    const j = item.position + Math.sign(dir);
    const other = siblings[j];
    if (!other) return;
    other.position = item.position;
    item.position = j;
  });
}

export async function createCategory(label: unknown) {
  return store.mutate((db) => {
    const name = str(label, 40);
    if (name.length < 2) throw new MenuError("Inserisci il nome della categoria.");
    let id = slug(name);
    if (db.categories.some((c) => c.id === id)) id = `${id}-${randomBytes(2).toString("hex")}`;
    const category = { id, label: name, position: db.categories.length };
    db.categories.push(category);
    return category;
  });
}

export async function updateCategory(id: string, input: { label?: unknown; move?: unknown }) {
  return store.mutate((db) => {
    const category = db.categories.find((c) => c.id === id);
    if (!category) throw new MenuError("Categoria non trovata.", 404);
    if (input.label !== undefined) {
      const name = str(input.label, 40);
      if (name.length < 2) throw new MenuError("Inserisci il nome della categoria.");
      category.label = name;
    }
    if (input.move) {
      const sorted = [...db.categories].sort(byPosition);
      sorted.forEach((c, i) => (c.position = i));
      const j = category.position + Math.sign(Number(input.move));
      const other = sorted[j];
      if (other) {
        other.position = category.position;
        category.position = j;
      }
    }
    return category;
  });
}

export async function deleteCategory(id: string) {
  return store.mutate((db) => {
    if (db.items.some((i) => i.category === id)) throw new MenuError("Svuota prima la categoria.", 409);
    db.categories = db.categories.filter((c) => c.id !== id);
  });
}
