import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionJavaScriptAssets } from './frontend-bundle-graph.mjs';

test('deferred editor dependencies are grouped while shared static dependencies stay in core', () => {
  const manifest = {
    main: { file: 'assets/main.js', isEntry: true, imports: ['shared'], dynamicImports: ['editor'] },
    shared: { file: 'assets/shared.js' },
    editor: { file: 'assets/Editor-abc.js', isDynamicEntry: true, imports: ['shared', 'tables'] },
    tables: { file: 'assets/tables.js' },
  };
  const result = partitionJavaScriptAssets(manifest, ['Editor-']);
  assert.deepEqual([...result.core].sort(), ['main.js', 'shared.js']);
  assert.deepEqual([...result.deferred.get('Editor-')].sort(), ['Editor-abc.js', 'tables.js']);
});

test('a dependency also imported by another route cannot be hidden in the deferred budget', () => {
  const manifest = {
    main: { file: 'assets/main.js', isEntry: true, imports: ['tables'] },
    editor: { file: 'assets/Editor-abc.js', isDynamicEntry: true, imports: ['tables'] },
    tables: { file: 'assets/tables.js' },
  };
  assert.deepEqual([...partitionJavaScriptAssets(manifest, ['Editor-']).deferred.get('Editor-')], ['Editor-abc.js']);
});
