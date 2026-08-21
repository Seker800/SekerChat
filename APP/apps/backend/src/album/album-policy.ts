import { BadRequestException } from '@nestjs/common';

export const MAX_ALBUM_TAGS = 10;
export const MAX_ALBUM_TAG_LENGTH = 24;

export function normalizeAlbumTag(value: string): { name: string; normalizedName: string } {
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || [...name].length > MAX_ALBUM_TAG_LENGTH) {
    throw new BadRequestException(`标签长度必须为 1-${MAX_ALBUM_TAG_LENGTH} 个字符。`);
  }
  return { name, normalizedName: name.toLocaleLowerCase('zh-CN') };
}

export function normalizeAlbumTags(values: readonly string[]): string[] {
  if (values.length > MAX_ALBUM_TAGS)
    throw new BadRequestException(`每张照片最多 ${MAX_ALBUM_TAGS} 个标签。`);
  const unique = new Map<string, string>();
  for (const value of values) {
    const tag = normalizeAlbumTag(value);
    if (!unique.has(tag.normalizedName)) unique.set(tag.normalizedName, tag.name);
  }
  return [...unique.values()];
}
