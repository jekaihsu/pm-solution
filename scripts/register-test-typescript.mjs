// Node 20 test support; use the repository's existing TypeScript compiler.
// This loader is local to the test process and never changes application files.
import { register, createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const compilerUrl = pathToFileURL(require.resolve("typescript")).href;
const loader = `
import ts from ${JSON.stringify(compilerUrl)};
import { readFile } from "node:fs/promises";
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (error) {
    if (specifier.startsWith(".") && !/\\.\\w+$/.test(specifier)) {
      return next(specifier + ".ts", context);
    }
    throw error;
  }
}
export async function load(url, context, next) {
  if (!url.startsWith("file:") || !url.endsWith(".ts")) return next(url, context);
  const source = await readFile(new URL(url), "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: new URL(url).pathname,
  });
  return { format: "module", source: result.outputText, shortCircuit: true };
}
`;
register("data:text/javascript," + encodeURIComponent(loader));
