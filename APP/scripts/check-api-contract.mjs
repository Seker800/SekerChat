import { readFile } from 'node:fs/promises';

const document = JSON.parse(
  await readFile(new URL('../contracts/openapi.json', import.meta.url), 'utf8'),
);
const requiredTags = new Set([
  'auth-browser',
  'auth-token',
  'groups',
  'servers',
  'messages',
  'uploads',
  'files',
  'subscriptions',
]);
const coveredTags = new Set();
const failures = [];

function hasDefinedShape(schema, seen = new Set()) {
  if (!schema) return false;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return true;
    seen.add(schema.$ref);
    const name = schema.$ref.split('/').at(-1);
    return hasDefinedShape(document.components?.schemas?.[name], seen);
  }
  if (schema.oneOf?.length || schema.anyOf?.length || schema.allOf?.length) {
    return [...(schema.oneOf ?? []), ...(schema.anyOf ?? []), ...(schema.allOf ?? [])].every(
      (entry) => hasDefinedShape(entry, new Set(seen)),
    );
  }
  if (schema.type === 'array') return hasDefinedShape(schema.items, seen);
  if (schema.type && schema.type !== 'object') return true;
  return (
    Object.keys(schema.properties ?? {}).length > 0 || schema.additionalProperties !== undefined
  );
}

for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem[method];
    if (!operation) continue;
    const tags = operation.tags ?? [];
    if (!tags.some((tag) => requiredTags.has(tag))) continue;
    tags.forEach((tag) => coveredTags.add(tag));

    const requestContent = operation.requestBody?.content ?? {};
    const requestSchemas = Object.values(requestContent)
      .map((entry) => entry?.schema)
      .filter(Boolean);
    if (requestSchemas.length > 0 && !requestSchemas.every((schema) => hasDefinedShape(schema))) {
      failures.push(`${method.toUpperCase()} ${path}: request schema has no defined fields`);
    }

    const success = Object.entries(operation.responses ?? {}).find(([status]) =>
      /^2\d\d$/.test(status),
    );
    if (!success) {
      failures.push(`${method.toUpperCase()} ${path}: missing success response`);
      continue;
    }
    const content = success[1]?.content ?? {};
    const schemas = Object.values(content)
      .map((entry) => entry?.schema)
      .filter(Boolean);
    if (schemas.length === 0)
      failures.push(`${method.toUpperCase()} ${path}: missing response schema`);
    else if (!schemas.every((schema) => hasDefinedShape(schema))) {
      failures.push(`${method.toUpperCase()} ${path}: response schema has no defined fields`);
    }
  }
}

for (const tag of requiredTags) {
  if (!coveredTags.has(tag)) failures.push(`missing required contract tag: ${tag}`);
}

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`OpenAPI coverage gate passed for ${requiredTags.size} domains.\n`);
}
