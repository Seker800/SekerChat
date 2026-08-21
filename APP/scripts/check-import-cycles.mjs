import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTypeScriptImportGraph } from './typescript-import-graph.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = [path.join(appRoot, 'apps'), path.join(appRoot, 'packages')];
const baselinePath = path.join(appRoot, 'config/import-cycle-baseline.json');
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

const graph = await buildTypeScriptImportGraph(appRoot, sourceRoots);

function canonicalCycle(nodes) {
  const rotations = nodes.map((_, index) => [...nodes.slice(index), ...nodes.slice(0, index)]);
  return rotations.map((rotation) => rotation.join(' -> ')).sort()[0];
}

const cycles = new Set();
const visited = new Set();
const stack = [];
const activeIndex = new Map();

function visit(node) {
  if (activeIndex.has(node)) {
    cycles.add(canonicalCycle(stack.slice(activeIndex.get(node))));
    return;
  }
  if (visited.has(node)) return;
  activeIndex.set(node, stack.length);
  stack.push(node);
  for (const dependency of graph.get(node) ?? []) visit(dependency);
  stack.pop();
  activeIndex.delete(node);
  visited.add(node);
}

for (const file of graph.keys()) visit(file);

const allowed = new Set(baseline.cycles.map((cycle) => canonicalCycle(cycle)));
const unexpected = [...cycles].filter((cycle) => !allowed.has(cycle)).sort();
const removed = [...allowed].filter((cycle) => !cycles.has(cycle)).sort();

console.log(`Import cycles: ${cycles.size}; allowed baseline: ${allowed.size}`);
for (const cycle of [...cycles].sort()) console.log(`- ${cycle}`);
if (removed.length > 0) {
  console.log(
    `Resolved baseline cycles (remove them from ${path.relative(appRoot, baselinePath)}):`,
  );
  for (const cycle of removed) console.log(`- ${cycle}`);
}
if (unexpected.length > 0) {
  throw new Error(`New import cycles detected:\n- ${unexpected.join('\n- ')}`);
}
