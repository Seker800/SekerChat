import assert from 'node:assert/strict';
import test from 'node:test';
import { UPLOAD_TARGET_HANDLERS } from './upload-target-handler';
import { UploadsModule } from './uploads.module';

test('UploadsModule registers target integrations without importing their domain in core metadata', () => {
  class ExampleIntegrationModule {}
  class ExampleTargetHandler {}

  const registration = UploadsModule.register({
    imports: [ExampleIntegrationModule],
    targetHandlers: [ExampleTargetHandler],
  });

  assert.deepEqual(registration.imports, [ExampleIntegrationModule]);
  const handlerProvider = registration.providers?.find(
    (provider) =>
      typeof provider === 'object' &&
      provider !== null &&
      'provide' in provider &&
      provider.provide === UPLOAD_TARGET_HANDLERS,
  );
  assert.ok(handlerProvider && 'inject' in handlerProvider);
  assert.deepEqual(handlerProvider.inject, [ExampleTargetHandler]);
});
