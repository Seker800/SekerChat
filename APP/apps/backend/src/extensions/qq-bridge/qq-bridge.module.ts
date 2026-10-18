import { Module } from '@nestjs/common';
import { MessagesModule } from '../../messages/messages.module';
import { FilesModule } from '../../files/files.module';
import { SystemConfigModule } from '../../system-config/system-config.module';
import { OutboxCoreModule } from '../../outbox/outbox-core.module';
import { QqBridgeAccessService } from './qq-bridge-access.service';
import { QqBridgeIngestService } from './qq-bridge-ingest.service';
import { QqBridgeDeliveryService } from './qq-bridge-delivery.service';
import { QqBridgeGuard } from './qq-bridge.guard';
import { QqBridgeController } from './qq-bridge.controller';
import { QqBridgeConnectorController } from './qq-bridge-connector.controller';

@Module({
  imports: [MessagesModule, FilesModule, SystemConfigModule, OutboxCoreModule],
  controllers: [QqBridgeController, QqBridgeConnectorController],
  providers: [QqBridgeAccessService, QqBridgeIngestService, QqBridgeDeliveryService, QqBridgeGuard],
})
export class QqBridgeModule {}
