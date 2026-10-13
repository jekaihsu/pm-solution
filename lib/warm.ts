// Keeps every located source in the server cache so pages open instantly: loaded
// once at startup and refreshed in the background on an interval.
import { getSourceData, isLarkConfigured } from "./lark";
import { SOURCES, isLocated } from "./reports";

const g = globalThis as typeof globalThis & { __pmWarm?: { running: boolean; status: WarmStatus } };

export interface WarmStatus {
  lastStart?: number;
  lastEnd?: number;
  ok: number;
  total: number;
  sources: Record<string, { ok: boolean; ms: number; at: number; records?: number; sourceTotal?: number; excluded?: number; error?: string }>;
}
// Shared across Next.js module copies (startup hook vs. API routes).
const shared = (g.__pmWarm ??= { running: false, status: { ok: 0, total: 0, sources: {} } });
export const warmStatus = shared.status;

export async function warmAll() {
  if (shared.running || !isLarkConfigured()) return;
  shared.running = true;
  const started = Date.now();
  warmStatus.lastStart = started;
  let ok = 0;
  try {
    const sources = SOURCES.filter(isLocated);
    let next = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < sources.length) {
          const src = sources[next++];
          const t = Date.now();
          try {
            const d = await getSourceData(src, true);
            ok++;
            warmStatus.sources[src.key] = { ok: true, ms: Date.now() - t, at: Date.now(), records: d.total, sourceTotal: d.sourceTotal, excluded: d.excluded };
          } catch (err) {
            const message = (err as Error).message;
            warmStatus.sources[src.key] = { ok: false, ms: Date.now() - t, at: Date.now(), error: message.slice(0, 200) };
            console.error(`[warm ${src.key}]`, message);
          }
        }
      }),
    );
    warmStatus.ok = ok;
    warmStatus.total = sources.length;
    warmStatus.lastEnd = Date.now();
    console.log(`[warm] ${ok}/${sources.length} sources in ${Date.now() - started}ms`);
  } finally {
    shared.running = false;
  }
}
