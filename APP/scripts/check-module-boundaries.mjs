import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findModuleBoundaryViolations } from './module-boundaries.mjs';
import { buildTypeScriptImportGraph } from './typescript-import-graph.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const graph = await buildTypeScriptImportGraph(appRoot, [
  path.join(appRoot, 'apps'),
  path.join(appRoot, 'packages'),
]);

const rules = [
  {
    name: '共享包不能依赖具体应用实现',
    from: /^packages\//,
    disallow: /^apps\//,
  },
];

const violations = findModuleBoundaryViolations(graph, rules);
console.log(`Module boundary violations: ${violations.length}`);
for (const violation of violations) {
  console.log(`- [${violation.rule}] ${violation.importer} -> ${violation.dependency}`);
}
if (violations.length > 0) {
  throw new Error('Module boundary violations detected.');
}
