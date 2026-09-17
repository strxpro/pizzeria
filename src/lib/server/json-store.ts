import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Mały magazyn JSON w `.data/` z kolejką zapisów (dwa żądania naraz nie nadpiszą pliku).
 * Wystarczy na jeden serwer Node; na hostingu bez dysku podmienić na bazę.
 */
export function jsonStore<T>(name: string, empty: () => T) {
  const file = path.join(process.cwd(), ".data", name);
  const g = globalThis as unknown as Record<string, Promise<unknown> | undefined>;
  const key = `__store_${name}`;

  async function read(): Promise<T> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      return empty();
    }
  }

  function mutate<R>(fn: (data: T) => R | Promise<R>): Promise<R> {
    const run = (g[key] ?? Promise.resolve()).then(async () => {
      const data = await read();
      const result = await fn(data);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2), "utf8");
      await rename(`${file}.tmp`, file);
      return result;
    });
    g[key] = run.catch(() => undefined);
    return run;
  }

  return { read, mutate };
}

/** Limit żądań na adres IP w oknie czasu (w pamięci procesu). */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: Request) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > max;
  };
}
