import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = path.join(appRoot, 'apps/frontend-react/dist/assets');
const budget = JSON.parse(
  await readFile(path.join(appRoot, 'config/frontend-bundle-budget.json'), 'utf8'),
);

const entries = await readdir(assetsRoot);
const assets = await Promise.all(
  entries.map(async (name) => ({
    name,
    bytes: (await stat(path.join(assetsRoot, name))).size,
  })),
);
const javascript = assets.filter(({ name }) => name.endsWith('.js'));
const css = assets.filter(({ name }) => name.endsWith('.css'));
const total = (items) => items.reduce((sum, item) => sum + item.bytes, 0);
const deferredBudgets = Object.entries(budget.deferredJavaScriptAssets ?? {});
const deferredJavaScript = javascript.filter(({ name }) =>
  deferredBudgets.some(([prefix]) => name.startsWith(prefix)),
);
const editorCss = css.filter(({ name }) => name.startsWith('SubscriptionArticleEditor-'));
const coreJavaScript = javascript.filter(
  ({ name }) => !deferredBudgets.some(([prefix]) => name.startsWith(prefix)),
);
const largestJavaScript = coreJavaScript.reduce(
  (largest, item) => (item.bytes > largest.bytes ? item : largest),
  { name: 'none', bytes: 0 },
);

const report = {
  largestJavaScript,
  totalJavaScriptBytes: total(coreJavaScript),
  deferredJavaScript,
  totalCssBytes: total(css),
  budgets: budget,
};
console.log(JSON.stringify(report, null, 2));

const violations = [];
if (largestJavaScript.bytes > budget.maxSingleJavaScriptBytes) {
  violations.push(
    `largest JavaScript asset ${largestJavaScript.name} is ${largestJavaScript.bytes} bytes`,
  );
}
if (report.totalJavaScriptBytes > budget.maxTotalJavaScriptBytes) {
  violations.push(`total JavaScript is ${report.totalJavaScriptBytes} bytes`);
}
for (const asset of deferredJavaScript) {
  const match = deferredBudgets.find(([prefix]) => asset.name.startsWith(prefix));
  const maxBytes = match?.[1];
  if (typeof maxBytes === 'number' && asset.bytes > maxBytes) {
    violations.push(
      `deferred JavaScript asset ${asset.name} is ${asset.bytes} bytes (budget ${maxBytes})`,
    );
  }
}
for (const asset of editorCss) {
  const content = await readFile(path.join(assetsRoot, asset.name), 'utf8');
  for (const pattern of budget.forbiddenEditorCssPatterns ?? []) {
    if (content.includes(pattern)) {
      violations.push(`editor CSS ${asset.name} contains unused feature styles: ${pattern}`);
    }
  }
}
for (const prefix of budget.forbiddenEditorAssetPrefixes ?? []) {
  const matchingAssets = assets.filter(({ name }) => name.startsWith(prefix));
  if (matchingAssets.length > 0) {
    violations.push(
      `editor build contains unused assets with prefix ${prefix}: ${matchingAssets.length}`,
    );
  }
}
if (report.totalCssBytes > budget.maxTotalCssBytes) {
  violations.push(`total CSS is ${report.totalCssBytes} bytes`);
}

if (violations.length > 0) {
  throw new Error(`Frontend bundle budget exceeded:\n- ${violations.join('\n- ')}`);
}
