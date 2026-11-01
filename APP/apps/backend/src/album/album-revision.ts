import type { Prisma } from '@prisma/client';

/** Advance only on content mutations, inside the existing business transaction. */
export function advanceAlbumRevision(transaction: Prisma.TransactionClient) {
  return transaction.albumState.upsert({
    where: { id: 1 },
    create: { id: 1, revision: 1n },
    update: { revision: { increment: 1 } },
    select: { revision: true },
  });
}
