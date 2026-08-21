import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageSerializerService } from './message-serializer.service';

test('serializeMessage includes attachment image dimensions for root and reply attachments', async () => {
  const serializer = new MessageSerializerService(
    {
      createFileAccessUrl: () => 'http://backend.test/files/content',
      createThumbnailAccessUrl: () => 'http://backend.test/files/thumb',
      shouldExposeInlineThumbnail: (mimeType: string, thumbnailStorageKey: string | null) =>
        Boolean(thumbnailStorageKey) && mimeType !== 'image/gif',
      resolveRenderableImageDimensions: async (file: {
        imageWidth?: number | null;
        imageHeight?: number | null;
      }) => ({
        width: file.imageWidth ?? null,
        height: file.imageHeight ?? null,
      }),
    } as never,
    {
      buildUserAvatarUrl: () => null,
    } as never,
    {
      buildReadReceipt: () => null,
    } as never,
  );

  const createdAt = new Date('2026-07-01T12:00:00.000Z');
  const message = {
    id: 'message-1',
    groupId: 'group-1',
    senderId: 'user-1',
    eventSequence: 101n,
    type: { toLowerCase: () => 'image' },
    text: null,
    mentionedUserIds: [],
    revokedAt: null,
    editedAt: null,
    createdAt,
    sender: {
      id: 'user-1',
      email: 'user-1@example.com',
      displayName: 'User 1',
      avatarStorageKey: null,
    },
    attachmentFile: {
      id: 'file-1',
      groupId: 'group-1',
      originalName: 'evidence.png',
      mimeType: 'image/png',
      size: 1234n,
      createdAt,
      uploaderId: 'user-1',
      storageKey: 'group-1/evidence.png',
      thumbnailStorageKey: 'group-1/thumb/evidence.png.jpg',
      imageWidth: 1200,
      imageHeight: 600,
      share: {
        expiresAt: new Date('2099-07-04T12:00:00.000Z'),
        revokedAt: null,
        revokedReason: null,
      },
      group: { archivedAt: null },
    },
    replyToMessage: {
      id: 'message-0',
      senderId: 'user-2',
      type: { toLowerCase: () => 'image' },
      text: 'reply preview',
      sender: {
        id: 'user-2',
        email: 'user-2@example.com',
        displayName: 'User 2',
        avatarStorageKey: null,
      },
      attachmentFile: {
        id: 'file-0',
        groupId: 'group-1',
        originalName: 'reply.png',
        mimeType: 'image/png',
        size: 5678n,
        createdAt,
        uploaderId: 'user-2',
        storageKey: 'group-1/reply.png',
        thumbnailStorageKey: 'group-1/thumb/reply.png.jpg',
        imageWidth: 640,
        imageHeight: 480,
        share: {
          expiresAt: new Date('2020-07-04T12:00:00.000Z'),
          revokedAt: null,
          revokedReason: null,
        },
        group: { archivedAt: null },
      },
    },
  };

  const result = await serializer.serializeMessage(message as never, [], false);

  assert.equal(result.attachment?.width, 1200);
  assert.equal(result.attachment?.height, 600);
  assert.equal(result.attachment?.groupId, 'group-1');
  assert.equal(result.attachment?.uploaderId, 'user-1');
  assert.equal(result.attachment?.createdAt, createdAt);
  assert.equal(result.attachment?.isSharing, true);
  assert.equal(result.replyTo?.attachment?.width, 640);
  assert.equal(result.replyTo?.attachment?.height, 480);
  assert.equal(result.replyTo?.attachment?.uploaderId, 'user-2');
  assert.equal(result.replyTo?.attachment?.isSharing, false);
});

test('serializeMessage does not expose static thumbnails for gif attachments', async () => {
  const serializer = new MessageSerializerService(
    {
      createFileAccessUrl: () => 'http://backend.test/files/content',
      createThumbnailAccessUrl: () => 'http://backend.test/files/thumb',
      shouldExposeInlineThumbnail: (mimeType: string, thumbnailStorageKey: string | null) =>
        Boolean(thumbnailStorageKey) && mimeType !== 'image/gif',
      resolveRenderableImageDimensions: async (file: {
        imageWidth?: number | null;
        imageHeight?: number | null;
      }) => ({
        width: file.imageWidth ?? null,
        height: file.imageHeight ?? null,
      }),
    } as never,
    {
      buildUserAvatarUrl: () => null,
    } as never,
    {
      buildReadReceipt: () => null,
    } as never,
  );

  const createdAt = new Date('2026-07-01T12:00:00.000Z');
  const message = {
    id: 'message-1',
    groupId: 'group-1',
    senderId: 'user-1',
    eventSequence: 101n,
    type: { toLowerCase: () => 'image' },
    text: null,
    mentionedUserIds: [],
    revokedAt: null,
    editedAt: null,
    createdAt,
    sender: {
      id: 'user-1',
      email: 'user-1@example.com',
      displayName: 'User 1',
      avatarStorageKey: null,
    },
    attachmentFile: {
      id: 'file-1',
      groupId: 'group-1',
      originalName: 'animated.gif',
      mimeType: 'image/gif',
      size: 1234n,
      createdAt,
      uploaderId: 'user-1',
      storageKey: 'group-1/animated.gif',
      thumbnailStorageKey: 'group-1/thumb/animated.gif.jpg',
      imageWidth: 480,
      imageHeight: 270,
    },
    replyToMessage: null,
  };

  const result = await serializer.serializeMessage(message as never, [], false);

  assert.equal(result.attachment?.thumbnailUrl, null);
  assert.equal(result.attachment?.contentUrl, 'http://backend.test/files/content');
  assert.equal(result.attachment?.isSharing, false);
});
