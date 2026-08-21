import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

async function collectSourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-openapi') {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await collectSourceFiles(entryPath)));
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      result.push(entryPath);
    }
  }
  return result;
}

async function resolveRelativeImport(importer, specifier, knownFiles) {
  if (!specifier.startsWith('.')) return null;
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    path.join(unresolved, 'index.ts'),
    path.join(unresolved, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (knownFiles.has(candidate)) return candidate;
    try {
      if ((await stat(candidate)).isFile() && knownFiles.has(candidate)) return candidate;
    } catch {
      // Try the next TypeScript resolution candidate.
    }
  }
  return null;
}

const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;

export async function buildTypeScriptImportGraph(appRoot, sourceRoots) {
  const files = (await Promise.all(sourceRoots.map(collectSourceFiles))).flat();
  const knownFiles = new Set(files);
  const graph = new Map();

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const dependencies = new Set();
    for (const match of source.matchAll(importPattern)) {
      const dependency = await resolveRelativeImport(file, match[1], knownFiles);
      if (dependency) dependencies.add(dependency);
    }
    graph.set(file, dependencies);
  }

  return new Map(
    [...graph].map(([file, dependencies]) => [
      path.relative(appRoot, file).split(path.sep).join('/'),
      new Set(
        [...dependencies].map((dependency) =>
          path.relative(appRoot, dependency).split(path.sep).join('/'),
        ),
      ),
    ]),
  );
}
