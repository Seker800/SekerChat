import { BadRequestException } from '@nestjs/common';

interface AlbumCursor {
  createdAt: Date;
  id: string;
}

export function encodeAlbumCursor(value: AlbumCursor): string {
  return Buffer.from(
    JSON.stringify({ v: 1, createdAt: value.createdAt.toISOString(), id: value.id }),
  ).toString('base64url');
}

export function decodeAlbumCursor(value: string): AlbumCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const createdAt = new Date(String(parsed.createdAt));
    if (parsed.v !== 1 || !String(parsed.id).trim() || Number.isNaN(createdAt.getTime()))
      throw new Error();
    return { createdAt, id: String(parsed.id) };
  } catch {
    throw new BadRequestException('相册游标无效。');
  }
}
