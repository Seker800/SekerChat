import { partitionJavaScriptAssets } from './frontend-bundle-graph.mjs';
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
const manifest = JSON.parse(await readFile(path.join(assetsRoot, '../.vite/manifest.json'), 'utf8'));
const partition = partitionJavaScriptAssets(manifest, deferredBudgets.map(([prefix]) => prefix));
const deferredJavaScript = javascript.filter(({ name }) => !partition.core.has(name));
const editorCss = css.filter(({ name }) => name.startsWith('SubscriptionArticleEditor-'));
const coreJavaScript = javascript.filter(({ name }) => partition.core.has(name));
for (const asset of javascript) {
  if (!partition.core.has(asset.name) && ![...partition.deferred.values()].some((files) => files.has(asset.name))) {
    throw new Error(`JavaScript asset is missing from the build manifest: ${asset.name}`);
  }
}
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
for (const [prefix, maxBytes] of deferredBudgets) {
  const files = partition.deferred.get(prefix);
  const bytes = total(javascript.filter(({ name }) => files.has(name)));
  if (bytes > maxBytes) violations.push(`deferred JavaScript group ${prefix} is ${bytes} bytes (budget ${maxBytes})`);
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
