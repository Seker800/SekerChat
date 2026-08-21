import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupLifecycleModule } from '../group-lifecycle/group-lifecycle.module';
import { AttendanceConfigService } from './attendance-config.service';
import { PermissionService } from './permission.service';
import { CapabilitiesService } from './capabilities.service';
import { DndConfigService } from './dnd-config.service';
import { FileUploadConfigService } from './file-upload-config.service';
import { PermissionConfigService } from './permission-config.service';
import { RegistrationConfigService } from './registration-config.service';
import { RetentionConfigService } from './retention-config.service';
import { SystemConfigController } from './system-config.controller';
import { SystemConfigStoreService } from './system-config-store.service';
import { SystemConfigService } from './system-config.service';
import { WorkStatusConfigService } from './work-status-config.service';

@Module({
  imports: [PrismaModule, GroupLifecycleModule],
  controllers: [SystemConfigController],
  providers: [
    SystemConfigStoreService,
    PermissionConfigService,
    AttendanceConfigService,
    DndConfigService,
    FileUploadConfigService,
    RetentionConfigService,
    RegistrationConfigService,
    WorkStatusConfigService,
    SystemConfigService,
    PermissionService,
    CapabilitiesService,
  ],
  exports: [
    SystemConfigStoreService,
    PermissionConfigService,
    AttendanceConfigService,
    DndConfigService,
    FileUploadConfigService,
    RetentionConfigService,
    RegistrationConfigService,
    WorkStatusConfigService,
    SystemConfigService,
    PermissionService,
    CapabilitiesService,
  ],
})
export class SystemConfigModule {}
