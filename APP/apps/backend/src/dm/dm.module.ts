import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupsModule } from '../groups/groups.module';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';

@Module({
  imports: [PrismaModule, GroupsModule],
  controllers: [DmController],
  providers: [DmService],
  exports: [DmService],
})
export class DmModule {}
