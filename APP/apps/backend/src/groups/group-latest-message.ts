import { MessageType, Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { LatestMessageSummary } from './group-types';

type LatestMessageRow = {
  groupId: string;
  text: string | null;
  senderId: string | null;
  type: string;
};

/**
 * Load one latest-message summary per group without materializing each group's history.
 *
 * The previous nested `messages: { take: 1 }` select made Prisma fetch every message
 * in every requested group and slice in JS. LATERAL + LIMIT 1 uses the existing
 * (groupId, createdAt) index and stays flat as history grows.
 */
export async function loadLatestMessages(
  prisma: PrismaService,
  groupIds: string[],
): Promise<Map<string, LatestMessageSummary>> {
  const result = new Map<string, LatestMessageSummary>();
  if (groupIds.length === 0) return result;

  const rows = await prisma.$queryRaw<LatestMessageRow[]>`
    SELECT
      g.id AS "groupId",
      m.text,
      m."senderId",
      m.type::text AS "type"
    FROM "Group" g
    LEFT JOIN LATERAL (
      SELECT text, "senderId", type
      FROM "Message"
      WHERE "groupId" = g.id
      ORDER BY "createdAt" DESC
      LIMIT 1
    ) m ON true
    WHERE g.id IN (${Prisma.join(groupIds)})
  `;

  for (const row of rows) {
    if (!row.senderId) continue;
    result.set(row.groupId, {
      text: row.text,
      senderId: row.senderId,
      type: row.type as MessageType,
    });
  }
  return result;
}

export async function loadLatestMessage(
  prisma: PrismaService,
  groupId: string,
): Promise<LatestMessageSummary | null> {
  const message = await prisma.message.findFirst({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    select: { text: true, senderId: true, type: true },
  });
  return message ? { text: message.text, senderId: message.senderId, type: message.type } : null;
}
