import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

type AttendanceRequestUser = { sub?: string; actorType?: 'AGENT_BOT' | 'CLI_BOT' | 'HUMAN' };
export type AttendanceTrackingRequest = Request & { user?: AttendanceRequestUser };
const EVENT_WINDOW_MS = 15_000;
const TRACKED_MUTATIONS: Array<{ method: string; pattern: RegExp; actionType: string }> = [
  { method: 'POST', pattern: /^\/api\/groups\/[^/]+\/messages$/, actionType: 'message.send' },
  {
    method: 'PATCH',
    pattern: /^\/api\/groups\/[^/]+\/messages\/[^/]+$/,
    actionType: 'message.edit',
  },
  {
    method: 'POST',
    pattern: /^\/api\/groups\/[^/]+\/messages\/[^/]+\/revoke$/,
    actionType: 'message.recall',
  },
  { method: 'POST', pattern: /^\/api\/groups\/[^/]+\/tasks$/, actionType: 'task.create' },
  { method: 'PATCH', pattern: /^\/api\/groups\/[^/]+\/tasks\/[^/]+$/, actionType: 'task.update' },
  { method: 'DELETE', pattern: /^\/api\/groups\/[^/]+\/tasks\/[^/]+$/, actionType: 'task.delete' },
  {
    method: 'PATCH',
    pattern: /^\/api\/groups\/[^/]+\/work-state$/,
    actionType: 'work-state.update',
  },
  { method: 'POST', pattern: /^\/api\/groups$/, actionType: 'group.create' },
  { method: 'PATCH', pattern: /^\/api\/groups\/[^/]+$/, actionType: 'group.update' },
  { method: 'PATCH', pattern: /^\/api\/groups\/admin\/categories$/, actionType: 'category.rename' },
  { method: 'DELETE', pattern: /^\/api\/groups\/admin\/categories$/, actionType: 'category.reset' },
  {
    method: 'POST',
    pattern: /^\/api\/groups\/[^/]+\/admin\/join$/,
    actionType: 'group.admin-join',
  },
  { method: 'POST', pattern: /^\/api\/groups\/[^/]+\/members$/, actionType: 'member.invite' },
  {
    method: 'PATCH',
    pattern: /^\/api\/groups\/[^/]+\/members\/[^/]+\/role$/,
    actionType: 'member.role.update',
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/groups\/[^/]+\/members\/[^/]+$/,
    actionType: 'member.remove',
  },
  { method: 'PATCH', pattern: /^\/api\/groups\/[^/]+\/archive$/, actionType: 'group.archive' },
  {
    method: 'POST',
    pattern: /^\/api\/groups\/[^/]+\/artifacts\/upload$/,
    actionType: 'artifact.upload',
  },
  {
    method: 'POST',
    pattern: /^\/api\/groups\/[^/]+\/artifacts\/confirm$/,
    actionType: 'artifact.confirm',
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/groups\/[^/]+\/artifacts\/confirm$/,
    actionType: 'artifact.unlock',
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/groups\/[^/]+\/artifacts\/[^/]+$/,
    actionType: 'artifact.delete',
  },
  { method: 'POST', pattern: /^\/api\/dm$/, actionType: 'dm.open' },
  { method: 'POST', pattern: /^\/api\/dm\/[^/]+\/messages$/, actionType: 'dm.send' },
  { method: 'PATCH', pattern: /^\/api\/dm\/[^/]+\/messages\/[^/]+$/, actionType: 'dm.edit' },
  {
    method: 'POST',
    pattern: /^\/api\/dm\/[^/]+\/messages\/[^/]+\/revoke$/,
    actionType: 'dm.recall',
  },
  { method: 'PATCH', pattern: /^\/api\/auth\/me$/, actionType: 'profile.update' },
];

@Injectable()
export class AttendanceActionRecorder {
  constructor(private readonly prisma: PrismaService) {}

  async record(request: AttendanceTrackingRequest): Promise<void> {
    const userId = request.user?.sub;
    if (!userId || request.user?.actorType !== 'HUMAN') return;
    const method = request.method.toUpperCase();
    const path = request.originalUrl.split('?')[0];
    const matched = TRACKED_MUTATIONS.find(
      (item) => item.method === method && item.pattern.test(path),
    );
    if (!matched) return;

    const occurredAt = new Date();
    const existing = await this.prisma.attendanceActionEvent.findFirst({
      where: {
        userId,
        requestMethod: method,
        requestPath: path,
        occurredAt: { gte: new Date(occurredAt.getTime() - EVENT_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (existing) return;
    await this.prisma.attendanceActionEvent.create({
      data: {
        userId,
        occurredAt,
        actionType: matched.actionType,
        requestMethod: method,
        requestPath: path,
        groupId: /^\/api\/groups\/([^/]+)/.exec(path)?.[1] ?? null,
        actorType: 'HUMAN',
      },
    });
  }
}
