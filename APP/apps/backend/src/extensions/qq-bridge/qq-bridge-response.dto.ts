import { QqCatalogGroupDto } from './qq-bridge.dto';

export class QqBridgeConnectorResponseDto {
  id!: string;
  name!: string;
  enabled!: boolean;
  revokedAt!: string | null;
  lastSeenAt!: string | null;
  connected!: boolean;
  catalog!: QqCatalogGroupDto[];
}
export class QqBridgeBindingResponseDto {
  id!: string;
  connectorId!: string;
  groupId!: string;
  accountId!: string;
  qqGroupId!: string;
  enabled!: boolean;
  bidirectional!: boolean;
  revision!: number;
  enabledAt!: string | null;
  archivedAt!: string | null;
  createdAt!: string;
}
export class QqBridgeTaskResponseDto {
  id!: string;
  bindingId!: string;
  action!: string;
  status!: string;
  errorCode!: string | null;
  createdAt!: string;
}
export class QqBridgeGroupOptionDto {
  id!: string;
  name!: string;
  category!: string;
}
export class QqBridgeInfoDto {
  id!: string;
  name!: string;
  version!: number;
}
export class QqBridgeOverviewResponseDto {
  extension!: QqBridgeInfoDto;
  connectors!: QqBridgeConnectorResponseDto[];
  bindings!: QqBridgeBindingResponseDto[];
  deliveries!: QqBridgeTaskResponseDto[];
  groups!: QqBridgeGroupOptionDto[];
}
export class QqBridgeCredentialResponseDto {
  id!: string;
  token!: string;
}
export class QqBridgeActionResponseDto {
  ok!: boolean;
}
