import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isPackagingWorkStatus } from '@sekerchat/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ArchiveGroupApplicationService } from '../group-lifecycle/archive-group-application.service';
import { UpdateSystemConfigDto, WorkStatusDefDto } from './dto/update-system-config.dto';
import { SystemConfigStoreService } from './system-config-store.service';

@Injectable()
export class WorkStatusConfigService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly store: SystemConfigStoreService,
    private readonly archiveGroupApplicationService: ArchiveGroupApplicationService,
  ) {}

  async getDefinitions(): Promise<WorkStatusDefDto[]> {
    const raw = await this.store.getValue('workStatusDefs');
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as WorkStatusDefDto[]) : [];
    } catch {
      return [];
    }
  }

  async isArchiveStatus(status: string): Promise<boolean> {
    const defs = await this.getDefinitions();
    return defs.some((definition) => definition.name === status && definition.isArchive);
  }

  async isPackagingStatus(status: string): Promise<boolean> {
    return isPackagingWorkStatus(status, await this.getDefinitions());
  }

  async updateFromDto(dto: UpdateSystemConfigDto): Promise<void> {
    if (dto.workStatusDefs === undefined) {
      return;
    }
    const definitions = dto.workStatusDefs;
    if (definitions.some((definition) => definition.isPackaging && definition.isArchive)) {
      throw new BadRequestException('同一个工作状态不能同时启用打包和归档。');
    }

    await this.prismaService.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('sekerchat-work-status-config', 0))`,
      );
      await this.migrateStatuses(definitions, transaction);
      await this.archiveExistingGroups(definitions, transaction);
      const value = JSON.stringify(definitions);
      await transaction.systemConfig.upsert({
        where: { key: 'workStatusDefs' },
        create: { key: 'workStatusDefs', value },
        update: { value },
      });
    });
  }

  private async archiveExistingGroups(
    definitions: WorkStatusDefDto[],
    transaction: Prisma.TransactionClient,
  ) {
    const archiveStatusNames = definitions
      .filter((definition) => definition.isArchive)
      .map((definition) => definition.name);

    if (archiveStatusNames.length === 0) {
      return;
    }

    const groups = await transaction.group.findMany({
      where: {
        archivedAt: null,
        isDM: false,
        workState: {
          is: {
            status: { in: archiveStatusNames },
          },
        },
      },
      select: { id: true },
    });
    for (const group of groups) {
      await this.archiveGroupApplicationService.execute(
        {
          groupId: group.id,
          archive: true,
          reason: 'work-status',
        },
        transaction,
      );
    }
  }

  private async migrateStatuses(
    newDefs: WorkStatusDefDto[],
    transaction: Prisma.TransactionClient,
  ) {
    const stored = await transaction.systemConfig.findUnique({
      where: { key: 'workStatusDefs' },
      select: { value: true },
    });
    if (!stored?.value) {
      return;
    }

    let oldDefs: WorkStatusDefDto[];
    try {
      oldDefs = JSON.parse(stored.value);
    } catch {
      return;
    }

    if (!Array.isArray(oldDefs) || oldDefs.length === 0) {
      return;
    }

    const newNames = new Set(newDefs.map((definition) => definition.name));

    if (oldDefs.length === newDefs.length) {
      for (let index = 0; index < oldDefs.length; index += 1) {
        const oldName = oldDefs[index].name;
        const newName = newDefs[index].name;
        if (!oldName || !newName || oldName === newName) {
          continue;
        }

        await this.renameStatus(oldName, newName, transaction);
      }
    }

    for (const oldDef of oldDefs) {
      if (!oldDef.name || newNames.has(oldDef.name)) {
        continue;
      }

      await this.clearStatus(oldDef.name, transaction);
    }

    const dbStatuses = await transaction.groupWorkState.findMany({
      select: { status: true },
      distinct: ['status'],
    });

    for (const { status } of dbStatuses) {
      if (!newNames.has(status)) {
        await this.clearStatus(status, transaction);
      }
    }
  }

  private async renameStatus(
    oldName: string,
    newName: string,
    transaction: Prisma.TransactionClient,
  ) {
    await transaction.groupWorkState.updateMany({
      where: { status: oldName },
      data: { status: newName },
    });
    await transaction.groupWorkStateHistory.updateMany({
      where: { fromStatus: oldName },
      data: { fromStatus: newName },
    });
    await transaction.groupWorkStateHistory.updateMany({
      where: { toStatus: oldName },
      data: { toStatus: newName },
    });
  }

  private async clearStatus(name: string, transaction: Prisma.TransactionClient) {
    await transaction.groupWorkState.deleteMany({
      where: { status: name },
    });
  }
}
