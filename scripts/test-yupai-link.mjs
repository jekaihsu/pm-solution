// 預排核對報告：設定模組求值與 Overview／R04 JSX 入口契約。離線，不連 Lark。
// Usage: node --test scripts/test-yupai-link.mjs
// 不涵蓋瀏覽器渲染、點擊或外部文件可用性；缺少整合檔案／入口時應失敗。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const DEFAULT_URL = "https://yong-xiang-survey.jp.larksuite.com/docx/VCAgdgGFooejQ9xqiHZjaCGhpIe";
const OVERRIDE_URL = "https://example.com/docx/another-report?view=review&week=2026-10-19#findings";
const ENV_KEY = "NEXT_PUBLIC_YUPAI_REPORT_URL";
let evaluation = 0;

function readSource(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  try {
    return readFileSync(url, "utf8");
  } catch (error) {
    assert.fail(`缺少或無法讀取本 worktree 的 ${relativePath}: ${error.code}`);
  }
}

async function loadConfig() {
  const source = readSource("../lib/yupaiReport.ts");
  const { outputText } = ts.transpileModule(source, {
    fileName: "yupaiReport.ts",
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  // 每次執行真正的模組求值；fragment 讓相同程式也不會沿用 ESM 快取。
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}#${++evaluation}`);
}

async function withEnv(value, run) {
  const saved = process.env[ENV_KEY];
  try {
    if (value === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = value;
    await run();
  } finally {
    if (saved === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = saved;
  }
}

// 環境變數是 process 全域狀態，設定案例不可並行。
test("設定：未設定 env 時使用完整預設網址、DOC_ID 與 TITLE", { concurrency: false }, async () => {
  await withEnv(undefined, async () => {
    const config = await loadConfig();
    assert.equal(config.YUPAI_REPORT_URL, DEFAULT_URL);
    assert.equal(config.YUPAI_REPORT_DOC_ID, "VCAgdgGFooejQ9xqiHZjaCGhpIe");
    assert.equal(config.YUPAI_REPORT_TITLE, "預排核對報告");
  });
});

test("設定：空字串 env 回退到預設網址", { concurrency: false }, async () => {
  await withEnv("", async () => {
    assert.equal((await loadConfig()).YUPAI_REPORT_URL, DEFAULT_URL);
  });
});

test("設定：非空 env 完整覆寫網址，保留 query 與 fragment", { concurrency: false }, async () => {
  await withEnv(OVERRIDE_URL, async () => {
    assert.equal((await loadConfig()).YUPAI_REPORT_URL, OVERRIDE_URL);
  });
});

test("設定：覆寫後清除 env 並重新求值會回到預設網址", { concurrency: false }, async () => {
  await withEnv(OVERRIDE_URL, async () => {
    assert.equal((await loadConfig()).YUPAI_REPORT_URL, OVERRIDE_URL);
    delete process.env[ENV_KEY];
    assert.equal((await loadConfig()).YUPAI_REPORT_URL, DEFAULT_URL);
  });
});

function collect(root, predicate) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return matches;
}

function unwrap(expression) {
  while (expression && ts.isParenthesizedExpression(expression)) expression = expression.expression;
  return expression;
}

function isIdentifier(expression, name) {
  const node = unwrap(expression);
  return !!node && ts.isIdentifier(node) && node.text === name;
}

function assertReportLink(component) {
  const source = ts.createSourceFile(
    `${component}.tsx`, readSource(`../components/${component}.tsx`),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  assert.equal(source.parseDiagnostics.length, 0, `${component}: TSX 必須能正確解析`);

  const imports = source.statements.filter((node) => ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@/lib/yupaiReport");
  for (const symbol of ["YUPAI_REPORT_TITLE", "YUPAI_REPORT_URL"]) {
    const imported = imports.some(({ importClause }) => {
      const bindings = importClause?.namedBindings;
      return !importClause?.isTypeOnly && bindings && ts.isNamedImports(bindings)
        && bindings.elements.some((item) => !item.isTypeOnly
          && item.name.text === symbol && (item.propertyName ?? item.name).text === symbol);
    });
    assert.ok(imported, `${component}: 缺少來自 @/lib/yupaiReport 的 ${symbol} named import`);
  }

  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node)
    && node.name?.text === component
    && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
  assert.ok(fn?.body, `${component}: 缺少 export default function ${component}()`);
  // 只看元件本體直接回傳的 JSX，不接受其他 helper 裡的連結。
  const returns = fn.body.statements.filter(ts.isReturnStatement);
  assert.equal(returns.length, 1, `${component}: 預期一個主回傳 JSX`);
  const jsx = unwrap(returns[0].expression);
  assert.ok(jsx && (ts.isJsxElement(jsx) || ts.isJsxFragment(jsx)), `${component}: 主回傳值必須是 JSX`);

  const anchors = collect(jsx, (node) => ts.isJsxElement(node)
    && isIdentifier(node.openingElement.tagName, "a")
    && node.children.some((child) => collect(child, (n) => ts.isJsxExpression(n)
      && isIdentifier(n.expression, "YUPAI_REPORT_TITLE")).length > 0));
  assert.equal(anchors.length, 1, `${component}: 主回傳 JSX 必須恰有一個使用 YUPAI_REPORT_TITLE 的文件 <a>`);

  const attributes = anchors[0].openingElement.attributes.properties;
  function attribute(name) {
    const matches = attributes.filter((node) => ts.isJsxAttribute(node) && node.name.text === name);
    assert.equal(matches.length, 1, `${component}: 文件 <a> 必須有一個 ${name} 屬性`);
    return matches[0].initializer;
  }
  function literalValue(initializer) {
    const value = initializer && ts.isJsxExpression(initializer) ? unwrap(initializer.expression) : initializer;
    return value && ts.isStringLiteral(value) ? value.text : undefined;
  }
  const href = attribute("href");
  assert.ok(href && ts.isJsxExpression(href) && isIdentifier(href.expression, "YUPAI_REPORT_URL"),
    `${component}: 文件 <a> 的 href 必須使用 {YUPAI_REPORT_URL}`);
  assert.equal(literalValue(attribute("target")), "_blank", `${component}: 文件 <a> 必須使用 target="_blank"`);
  const rel = literalValue(attribute("rel"));
  assert.ok(rel?.split(/\s+/).includes("noopener"), `${component}: 文件 <a> 的 rel 必須包含 noopener token`);
}

for (const component of ["Overview", "HrBoard"]) {
  test(`${component}：唯一報告入口使用共用設定，並在同一 <a> 保護新分頁`, () => {
    assertReportLink(component);
  });
}
