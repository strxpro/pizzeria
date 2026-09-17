import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dictFor, type Lang } from "../i18n";
import { emailConfigured, esc, layout, sendMail } from "./email";
import { jsonStore } from "./json-store";

/**
 * Logowanie do „Moich zamówień” bez hasła: kod 6 cyfr wysłany na e-mail.
 *
 * - kod przechowujemy tylko jako skrót (HMAC), ważny 10 minut, najwyżej 5 prób;
 * - po weryfikacji dostajesz podpisaną sesję w ciasteczku httpOnly na 30 dni;
 * - odpowiedź na „wyślij kod” jest zawsze taka sama — nie zdradza, czy e-mail ma zamówienia.
 */

export const SESSION_COOKIE = "pz_session";
const CODE_TTL = 10 * 60_000;
const SESSION_TTL = 30 * 24 * 60 * 60_000;
const MAX_ATTEMPTS = 5;

type CodeEntry = { hash: string; expires: number; attempts: number; sentAt: number[] };
const codes = jsonStore<Record<string, CodeEntry>>("login-codes.json", () => ({}));

let cachedSecret: string | null = null;

/** Sekret do podpisów: `SESSION_SECRET` albo losowy, zapisany raz w `.data/secret` (jeden serwer). */
async function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  const file = path.join(process.cwd(), ".data", "secret");
  try {
    cachedSecret = (await readFile(file, "utf8")).trim();
  } catch {
    cachedSecret = randomBytes(32).toString("hex");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, cachedSecret, "utf8");
  }
  return cachedSecret;
}

const key = (email: string) => createHash("sha256").update(email).digest("hex");

export class AuthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function requestCode(email: string, lang: Lang) {
  const now = Date.now();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const hash = createHmac("sha256", await secret()).update(`${email}:${code}`).digest("hex");

  await codes.mutate((db) => {
    // Sprzątanie wygasłych wpisów przy okazji.
    for (const [k, v] of Object.entries(db)) if (v.expires < now - CODE_TTL) delete db[k];
    const prev = db[key(email)];
    const recent = (prev?.sentAt ?? []).filter((t) => now - t < 15 * 60_000);
    if (recent.length >= 3) throw new AuthError(dictFor(lang).common.tooMany, 429);
    db[key(email)] = { hash, expires: now + CODE_TTL, attempts: 0, sentAt: [...recent, now] };
  });

  const t = dictFor(lang);
  const html = layout(
    lang,
    `<div style="background:#ffcf3f;border:3px solid #120c08;border-radius:28px;padding:28px">
    <h1 style="margin:0;font-size:28px;line-height:1.1">${esc(t.account.emailSubject)}</h1>
    <p style="margin:18px 0 0;font-size:44px;font-weight:800;letter-spacing:10px">${code}</p>
    <p style="margin:18px 0 0;font-size:15px">${esc(t.account.emailText(code))}</p>
  </div>`,
  );
  await sendMail({ to: email, subject: `${code} — ${t.account.emailSubject}`, html, text: t.account.emailText(code), tag: "login-code" });

  // Tylko lokalnie i tylko bez skonfigurowanej poczty — żeby dało się przetestować logowanie.
  return { devCode: !emailConfigured() && process.env.NODE_ENV !== "production" ? code : undefined };
}

export async function verifyCode(email: string, code: string, lang: Lang) {
  const t = dictFor(lang);
  const hash = createHmac("sha256", await secret()).update(`${email}:${code}`).digest("hex");
  const ok = await codes.mutate((db) => {
    const entry = db[key(email)];
    if (!entry || entry.expires < Date.now() || entry.attempts >= MAX_ATTEMPTS) return false;
    entry.attempts += 1;
    const a = Buffer.from(entry.hash, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    delete db[key(email)];
    return true;
  });
  if (!ok) throw new AuthError(t.errors.code, 401);
  return createSession(email);
}

async function createSession(email: string) {
  const payload = Buffer.from(JSON.stringify({ e: email, x: Date.now() + SESSION_TTL })).toString("base64url");
  const sig = createHmac("sha256", await secret()).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, maxAge: SESSION_TTL / 1000 };
}

/** E-mail z ważnej sesji albo `null`. */
export async function sessionEmail(token: string | undefined) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", await secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { e: string; x: number };
    return typeof e === "string" && x > Date.now() ? e : null;
  } catch {
    return null;
  }
}
