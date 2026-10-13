// Supervisor SOP sign-offs ("是否符合 SOP") for R01, stored by this site — never
// written back to Lark. Kept as a JSON file in DATA_DIR (mount a persistent volume
// there on Zeabur) plus an append-only log of every change.
import "server-only";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SopEntry {
  ok: boolean;
  by: string;
  at: number;
}

const DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DIR, "sop.json");
const LOG = path.join(DIR, "sop-log.jsonl");

export const sopKey = (version: string, weekStart: number, group: string) => `${version}|${weekStart}|${group}`;
export const persistent = Boolean(process.env.DATA_DIR);

let queue: Promise<unknown> = Promise.resolve(); // serialise writes

async function readAll(): Promise<Record<string, SopEntry>> {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export async function listSop(version: string, weekStart: number): Promise<Record<string, SopEntry>> {
  const all = await readAll();
  const prefix = `${version}|${weekStart}|`;
  return Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
}

export function setSop(version: string, weekStart: number, group: string, ok: boolean, by: string): Promise<SopEntry> {
  const run = async () => {
    await mkdir(DIR, { recursive: true });
    const all = await readAll();
    const entry: SopEntry = { ok, by, at: Date.now() };
    all[sopKey(version, weekStart, group)] = entry;
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(all, null, 1));
    await rename(tmp, FILE);
    await appendFile(LOG, JSON.stringify({ version, weekStart, group, ...entry }) + "\n");
    return entry;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
