import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { UpdateTaskDto } from './dto/update-task.dto';

const taskSelect = {
  id: true,
  groupId: true,
  content: true,
  completed: true,
  createdAt: true,
  completedAt: true,
  createdBy: {
    select: {
      id: true,
      displayName: true,
      email: true,
    },
  },
  completedBy: {
    select: {
      id: true,
      displayName: true,
      email: true,
    },
  },
} as const;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly groupRealtimePublisher: GroupRealtimePublisher,
    private readonly messagesService: MessagesService,
  ) {}

  async listTasks(userId: string, groupId: string) {
    await this.ensureGroupMember(userId, groupId);

    const tasks = await this.prismaService.task.findMany({
      where: { groupId },
      select: taskSelect,
      orderBy: [
        { completed: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return tasks;
  }

  async createTask(userId: string, groupId: string, content: string) {
    await this.ensureGroupMember(userId, groupId);

    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('Task content is required.');
    }

    const task = await this.prismaService.task.create({
      data: {
        groupId,
        content: trimmed,
        createdById: userId,
      },
      select: taskSelect,
    });

    await this.groupRealtimePublisher.publishTaskCreated(groupId, task);

    const actorName = await this.resolveName(userId);
    void this.messagesService.createSystemMessage(groupId, userId, `${actorName} 创建了任务「${trimmed}」`);

    return task;
  }

  async updateTask(userId: string, groupId: string, taskId: string, dto: UpdateTaskDto) {
    await this.ensureGroupMember(userId, groupId);

    const existing = await this.prismaService.task.findUnique({
      where: { id: taskId },
    });

    if (!existing || existing.groupId !== groupId) {
      throw new NotFoundException('Task not found.');
    }

    const data: Record<string, unknown> = {};

    if (dto.content !== undefined) {
      const trimmed = dto.content.trim();
      if (!trimmed) {
        throw new BadRequestException('Task content cannot be empty.');
      }
      data.content = trimmed;
    }

    if (dto.completed !== undefined) {
      if (dto.completed) {
        data.completed = true;
        data.completedById = userId;
        data.completedAt = new Date();
      } else {
        data.completed = false;
        data.completedById = null;
        data.completedAt = null;
      }
    }

    const task = await this.prismaService.task.update({
      where: { id: taskId },
      data,
      select: taskSelect,
    });

    await this.groupRealtimePublisher.publishTaskUpdated(groupId, task);

    if (dto.completed !== undefined) {
      const actorName = await this.resolveName(userId);
      if (dto.completed) {
        void this.messagesService.createSystemMessage(groupId, userId, `${actorName} 完成了任务「${task.content}」`);
      } else {
        void this.messagesService.createSystemMessage(groupId, userId, `${actorName} 重新打开了任务「${task.content}」`);
      }
    }

    return task;
  }

  async deleteTask(userId: string, groupId: string, taskId: string) {
    await this.ensureGroupMember(userId, groupId);

    const existing = await this.prismaService.task.findUnique({
      where: { id: taskId },
    });

    if (!existing || existing.groupId !== groupId) {
      throw new NotFoundException('Task not found.');
    }

    if (existing.createdById !== userId) {
      throw new ForbiddenException('Only the task creator can delete it.');
    }

    await this.prismaService.task.delete({
      where: { id: taskId },
    });

    await this.groupRealtimePublisher.publishTaskDeleted(groupId, { id: taskId });

    const actorName = await this.resolveName(userId);
    void this.messagesService.createSystemMessage(groupId, userId, `${actorName} 删除了任务「${existing.content}」`);
  }

  private async resolveName(userId: string): Promise<string> {
    const user = await this.prismaService.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    return user?.displayName || '未知用户';
  }

  private async ensureGroupMember(userId: string, groupId: string) {
    const member = await this.prismaService.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this group.');
    }
  }
}
