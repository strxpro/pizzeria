import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Zdjęcia do opinii w `.data/uploads/`. Nazwy są losowe (nie do zgadnięcia),
 * a typ sprawdzamy po pierwszych bajtach pliku, nie po tym, co deklaruje przeglądarka.
 * Na hostingu bez dysku podmienić na magazyn obiektów (S3/R2) — interfejs zostaje.
 */
const DIR = path.join(process.cwd(), ".data", "uploads");
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_PHOTOS = 3;

const TYPES = [
  { ext: "jpg", mime: "image/jpeg", test: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", mime: "image/png", test: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "webp", mime: "image/webp", test: (b: Buffer) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
];

export async function savePhoto(file: File) {
  if (file.size > MAX_PHOTO_BYTES) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = TYPES.find((t) => t.test(bytes));
  if (!type) return null;
  const name = `${randomBytes(16).toString("hex")}.${type.ext}`;
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, name), bytes);
  return name;
}

export async function readPhoto(name: string) {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return null;
  const type = TYPES.find((t) => name.endsWith(`.${t.ext}`))!;
  try {
    return { bytes: await readFile(path.join(DIR, name)), mime: type.mime };
  } catch {
    return null;
  }
}
