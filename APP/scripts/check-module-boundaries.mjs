import { moduleBoundaryRules } from './module-boundary-rules.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findModuleBoundaryViolations } from './module-boundaries.mjs';
import { buildTypeScriptImportGraph } from './typescript-import-graph.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const graph = await buildTypeScriptImportGraph(appRoot, [
  path.join(appRoot, 'apps'),
  path.join(appRoot, 'packages'),
]);

const violations = findModuleBoundaryViolations(graph, moduleBoundaryRules);
console.log(`Module boundary violations: ${violations.length}`);
for (const violation of violations) {
  console.log(`- [${violation.rule}] ${violation.importer} -> ${violation.dependency}`);
}
if (violations.length > 0) {
  throw new Error('Module boundary violations detected.');
}
