import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { assertReadableGroupMembership } from '../groups/group-access';
import { PrismaService } from '../prisma/prisma.service';
import { fileObjectSelect } from './file-record.types';

@Injectable()
export class FileAccessService {
  private readonly logger = new Logger(FileAccessService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getReadableFile(groupId: string, fileId: string, userId: string) {
    await assertReadableGroupMembership(
      this.prismaService,
      this.logger,
      userId,
      groupId,
      'file_access_denied',
    );
    const file = await this.prismaService.fileObject.findFirst({
      where: { id: fileId, groupId },
      select: fileObjectSelect,
    });
    if (!file) throw new NotFoundException('File not found.');
    return file;
  }

  async assertWritableGroup(groupId: string, userId: string) {
    const group = await this.prismaService.group.findFirst({
      where: { id: groupId, members: { some: { userId } } },
      select: { id: true, archivedAt: true },
    });
    if (!group) {
      this.logger.warn(
        'file_write_denied',
        JSON.stringify({ userId, groupId, reason: 'not_member' }),
      );
      throw new ForbiddenException('Group access denied.');
    }
    if (group.archivedAt) {
      this.logger.warn(
        'file_write_denied',
        JSON.stringify({ userId, groupId, reason: 'archived_group' }),
      );
      throw new BadRequestException('Archived group is read-only.');
    }
    return group;
  }
}
