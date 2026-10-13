// Keeps every located source in the server cache so pages open instantly: loaded
// once at startup and refreshed in the background on an interval.
import { getSourceData, isLarkConfigured } from "./lark";
import { SOURCES, isLocated } from "./reports";

let running = false;

export async function warmAll() {
  if (running || !isLarkConfigured()) return;
  running = true;
  const started = Date.now();
  let ok = 0;
  try {
    const sources = SOURCES.filter(isLocated);
    let next = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < sources.length) {
          const src = sources[next++];
          try {
            await getSourceData(src, true);
            ok++;
          } catch (err) {
            console.error(`[warm ${src.key}]`, (err as Error).message);
          }
        }
      }),
    );
    console.log(`[warm] ${ok}/${sources.length} sources in ${Date.now() - started}ms`);
  } finally {
    running = false;
  }
}
