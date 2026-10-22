import path from 'node:path';

/** Partition by static reachability, so a shared dependency can never be hidden. */
export function partitionJavaScriptAssets(manifest, prefixes) {
  const entries = Object.entries(manifest);
  const closure = (roots) => {
    const seen = new Set();
    const visit = (key) => {
      if (seen.has(key)) return;
      if (!manifest[key]) throw new Error(`Missing bundle manifest dependency: ${key}`);
      seen.add(key);
      for (const dependency of manifest[key].imports ?? []) visit(dependency);
    };
    roots.forEach(visit);
    return new Set([...seen].map((key) => path.basename(manifest[key].file)).filter((file) => file.endsWith('.js')));
  };
  const deferredRoots = new Map(prefixes.map((prefix) => [prefix,
    entries.filter(([, entry]) => path.basename(entry.file).startsWith(prefix)).map(([key]) => key)]));
  for (const [prefix, roots] of deferredRoots) if (!roots.length) throw new Error(`Deferred bundle root not found: ${prefix}`);
  const roots = new Set([...deferredRoots.values()].flat());
  const sharedCore = closure(entries.filter(([key, entry]) => !roots.has(key) && (entry.isEntry || entry.isDynamicEntry)).map(([key]) => key));
  const deferred = new Map([...deferredRoots].map(([prefix, keys]) => [prefix,
    new Set([...closure(keys)].filter((file) => !sharedCore.has(file)))]));
  const privateFiles = new Set([...deferred.values()].flatMap((files) => [...files]));
  const core = new Set(entries.map(([, entry]) => path.basename(entry.file)).filter((file) => file.endsWith('.js') && !privateFiles.has(file)));
  return { core, deferred };
}
