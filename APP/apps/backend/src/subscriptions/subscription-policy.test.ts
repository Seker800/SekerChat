import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { test } from 'node:test';
import {
  DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_BYTES,
  MAX_SUBSCRIPTION_ATTACHMENTS,
  assertSubscriptionAttachmentAllowed,
  buildSubscriptionBodyPreview,
} from './subscription-policy';

test('subscription attachment defaults to a 5 GB limit and accepts the exact boundary', () => {
  assert.equal(DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_BYTES, 5n * 1024n * 1024n * 1024n);
  assert.doesNotThrow(() =>
    assertSubscriptionAttachmentAllowed({
      attachmentCount: MAX_SUBSCRIPTION_ATTACHMENTS - 1,
      sizeBytes: DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_BYTES,
      maxBytes: DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_BYTES,
    }),
  );
});

test('subscription attachment rejects files above 5 GB and a sixth attachment', () => {
  assert.throws(
    () =>
      assertSubscriptionAttachmentAllowed({
        attachmentCount: 0,
        sizeBytes: DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_BYTES + 1n,
        maxBytes: DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_BYTES,
      }),
    BadRequestException,
  );
  assert.throws(
    () =>
      assertSubscriptionAttachmentAllowed({
        attachmentCount: MAX_SUBSCRIPTION_ATTACHMENTS,
        sizeBytes: 1n,
        maxBytes: DEFAULT_SUBSCRIPTION_ATTACHMENT_MAX_BYTES,
      }),
    BadRequestException,
  );
});

test('subscription list preview strips markdown instead of exposing the full body', () => {
  const body = [
    '# 更新说明',
    '',
    '这是 **重要** 更新，[查看文档](https://example.com)。',
    '',
    '```ts',
    'const secret = "not part of preview";',
    '```',
    '后续全文不应出现在列表中。',
  ].join('\n');

  assert.equal(
    buildSubscriptionBodyPreview(body, 24),
    '更新说明 这是 重要 更新，查看文档…',
  );
});
