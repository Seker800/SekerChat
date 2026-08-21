import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const contract = JSON.parse(
  readFileSync(join(process.cwd(), '../../contracts/openapi.json'), 'utf8'),
) as {
  paths: Record<string, Record<string, { responses?: Record<string, { content?: unknown }> }>>;
};

const jsonResponsePaths = [
  ['/api/album/update-status', 'get', '200'],
  ['/api/album/viewed', 'post', '201'],
  ['/api/album/photos', 'get', '200'],
  ['/api/album/tags', 'get', '200'],
  ['/api/album/photos/{photoId}/manage', 'get', '200'],
  ['/api/album/photos/{photoId}/tags', 'patch', '200'],
  ['/api/album/photos/{photoId}', 'delete', '200'],
  ['/api/album/photos/batch-delete', 'post', '201'],
  ['/api/album/photos/{photoId}/view-url', 'get', '200'],
] as const;

test('album JSON endpoints publish concrete OpenAPI response schemas', () => {
  for (const [path, method, status] of jsonResponsePaths) {
    const response = contract.paths[path]?.[method]?.responses?.[status];
    assert.ok(response, `${method.toUpperCase()} ${path} must publish response ${status}`);
    assert.ok(response.content, `${method.toUpperCase()} ${path} must publish a response body`);
  }
});
