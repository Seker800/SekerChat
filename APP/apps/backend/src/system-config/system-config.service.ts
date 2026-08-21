import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { hasSystemPermission, getDefaultRolePermissions, type RolePermissions } from '@sekerchat/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceConfigService } from './attendance-config.service';
import { DndConfigService } from './dnd-config.service';
import { FileUploadConfigService } from './file-upload-config.service';
import { PermissionConfigService } from './permission-config.service';
import { RegistrationConfigService } from './registration-config.service';
import { RetentionConfigService } from './retention-config.service';
import { UpdateSystemConfigDto, WorkStatusDefDto } from './dto/update-system-config.dto';
import { SystemConfigStoreService } from './system-config-store.service';
import { WorkStatusConfigService } from './work-status-config.service';

@Injectable()
export class SystemConfigService {
  constructor(
    private readonly store: SystemConfigStoreService,
    private readonly prisma: PrismaService,
    private readonly permissionConfigService: PermissionConfigService,
    private readonly attendanceConfigService: AttendanceConfigService,
    private readonly dndConfigService: DndConfigService,
    private readonly fileUploadConfigService: FileUploadConfigService,
    private readonly retentionConfigService: RetentionConfigService,
    private readonly registrationConfigService: RegistrationConfigService,
    private readonly workStatusConfigService: WorkStatusConfigService,
  ) {}

  async getAll(): Promise<Record<string, string>> {
    return this.store.getAll();
  }

  async getVisibleConfig(actor: AuthenticatedUser): Promise<Record<string, string>> {
    const all = await this.getAll();
    if (actor.role === 'SUPER_ADMIN') {
      return all;
    }

    const visibleKeys = new Set([
      'attendanceTimezone',
      'attendanceClockInStart',
      'attendanceClockInEnd',
      'attendanceClockOutStart',
      'attendanceClockOutEnd',
      'attendanceWorkDays',
      'attendanceScheduledBreakMinutes',
      'attendanceActiveWindowMinutes',
      'dndOn1',
      'dndOff1',
      'dndOn2',
      'dndOff2',
      'dndDaysOfWeek',
      'workStatusDefs',
      'messageRetentionDays',
      'messageRetentionSizeGB',
      'textRetentionDays',
      'imageRetentionDays',
      'imageRetentionSizeGB',
      'fileRetentionDays',
      'fileRetentionSizeGB',
      'chatAttachmentMaxMB',
      'subscriptionAttachmentMaxMB',
      'registrationOpen',
      'rolePermissions',
    ]);

    return Object.fromEntries(Object.entries(all).filter(([key]) => visibleKeys.has(key)));
  }

  async updateConfig(actor: AuthenticatedUser, dto: UpdateSystemConfigDto): Promise<Record<string, string>> {
    if (actor.role !== 'SUPER_ADMIN') {
      const rp = await this.getRolePermissions();
      if (!hasSystemPermission(rp, actor.role, 'manage_system_config')) {
        throw new ForbiddenException('Insufficient permissions.');
      }
    }

    await this.workStatusConfigService.updateFromDto(dto);
    await this.attendanceConfigService.updateFromDto(dto);
    await this.dndConfigService.updateFromDto(dto);
    await this.fileUploadConfigService.updateFromDto(dto);
    await this.retentionConfigService.updateFromDto(dto);
    await this.registrationConfigService.updateFromDto(dto);
    await this.permissionConfigService.updateFromDto(dto);

    return this.getAll();
  }

  async getRolePermissions(): Promise<RolePermissions> {
    return this.permissionConfigService.getRolePermissions();
  }

  async getStorageStats(): Promise<{
    textMessageCount: number;
    imageStorageBytes: string;
    imageCount: number;
    fileStorageBytes: string;
    fileCount: number;
    artifactStorageBytes: string;
    artifactCount: number;
    totalAttachmentCount: number;
    totalAttachmentStorageBytes: string;
    totalStorageBytes: string;
  }> {
    const [textCount] = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "Message" WHERE "type" = 'TEXT' AND "revokedAt" IS NULL
    `;

    interface RawStatRow {
      total_bytes: string;
      file_count: bigint;
    }

    const [imageStats] = await this.prisma.$queryRaw<RawStatRow[]>`
      SELECT
        COALESCE(SUM(COALESCE(f."size", 0) + COALESCE(f."thumbnailSize", 0)), 0)::text AS total_bytes,
        COUNT(DISTINCT f.id)::bigint AS file_count
      FROM "FileObject" f
      WHERE f.id IN (
        SELECT DISTINCT m."attachmentFileId"
        FROM "Message" m
        WHERE m."type" = 'IMAGE' AND m."attachmentFileId" IS NOT NULL
      )
    `;

    const [fileStats] = await this.prisma.$queryRaw<RawStatRow[]>`
      SELECT
        COALESCE(SUM(COALESCE(f."size", 0) + COALESCE(f."thumbnailSize", 0)), 0)::text AS total_bytes,
        COUNT(DISTINCT f.id)::bigint AS file_count
      FROM "FileObject" f
      WHERE f.id IN (
        SELECT DISTINCT m."attachmentFileId"
        FROM "Message" m
        WHERE m."type" = 'FILE' AND m."attachmentFileId" IS NOT NULL
      )
    `;

    const [artifactStats] = await this.prisma.$queryRaw<RawStatRow[]>`
      SELECT
        COALESCE(SUM(a."size"), 0)::text AS total_bytes,
        COUNT(*)::bigint AS file_count
      FROM "GroupArtifact" a
    `;

    const imageBytes = imageStats?.total_bytes ?? '0';
    const fileBytes = fileStats?.total_bytes ?? '0';
    const artifactBytes = artifactStats?.total_bytes ?? '0';

    return {
      textMessageCount: Number(textCount?.count ?? 0n),
      imageStorageBytes: imageBytes,
      imageCount: Number(imageStats?.file_count ?? 0n),
      fileStorageBytes: fileBytes,
      fileCount: Number(fileStats?.file_count ?? 0n),
      artifactStorageBytes: artifactBytes,
      artifactCount: Number(artifactStats?.file_count ?? 0n),
      totalAttachmentCount: Number((imageStats?.file_count ?? 0n) + (fileStats?.file_count ?? 0n)),
      totalAttachmentStorageBytes: String(BigInt(imageBytes) + BigInt(fileBytes)),
      totalStorageBytes: String(BigInt(imageBytes) + BigInt(fileBytes) + BigInt(artifactBytes)),
    };
  }
}
