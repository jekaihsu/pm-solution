// Supervisor SOP sign-offs ("是否符合 SOP") per work order for R01/R02, stored by this site — never
// written back to Lark. Kept as a JSON file in DATA_DIR (mount a persistent volume
// there on Zeabur) plus an append-only log of every change.
import "server-only";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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

// Keys are work orders ("order:<record id>"); several can be set in one write
// (「整組全部符合」).
export function setSop(version: string, weekStart: number, groups: string[], ok: boolean, by: string): Promise<SopEntry> {
  const run = async () => {
    await mkdir(DIR, { recursive: true });
    const all = await readAll();
    const entry: SopEntry = { ok, by, at: Date.now() };
    for (const group of groups) all[sopKey(version, weekStart, group)] = entry;
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(all, null, 1));
    await rename(tmp, FILE);
    await appendFile(LOG, groups.map((group) => JSON.stringify({ version, weekStart, group, ...entry })).join("\n") + "\n");
    return entry;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

// For /api/health: is the volume mounted and writable? Counts only, no contents.
export async function storageStatus() {
  const probe = path.join(DIR, `.probe-${process.pid}`);
  let writable = false;
  let error: string | undefined;
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(probe, String(Date.now()));
    await rm(probe, { force: true });
    writable = true;
  } catch (err) {
    error = (err as Error).message;
  }
  let entries: number | null = null;
  try {
    entries = Object.keys(await readAll()).length;
  } catch {
    entries = null;
  }
  return { dataDir: DIR, dataDirSet: persistent, writable, sopEntries: entries, error };
}
