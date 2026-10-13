// Next.js runs register() once when the server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warmAll } = await import("./lib/warm");
  const every = Number(process.env.WARM_INTERVAL_SECONDS ?? 300) * 1000;
  setTimeout(() => void warmAll(), 1000);
  setInterval(() => void warmAll(), every).unref?.();
}
