import { Prisma } from '@prisma/client';

export type ExternalAuthor = {
  id: string;
  platform: string;
  displayName: string;
  occurredAt: string;
};

export function readExternalAuthor(value: Prisma.JsonValue | undefined): ExternalAuthor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.platform !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.occurredAt !== 'string'
  )
    return null;
  return {
    id: value.id,
    platform: value.platform,
    displayName: value.displayName,
    occurredAt: value.occurredAt,
  };
}
