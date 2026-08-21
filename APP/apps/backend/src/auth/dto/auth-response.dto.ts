export class AuthUserResponseDto {
  id!: string;
  email!: string;
  displayName!: string | null;
  role!: string;
  mustChangePassword?: boolean;
}

export class BrowserSessionResponseDto {
  user!: AuthUserResponseDto;
}

export class TokenSessionResponseDto extends BrowserSessionResponseDto {
  accessToken!: string;
  refreshToken!: string;
}

export class RequestCodeResponseDto {
  deliveryHint!: string;
}

export class LogoutResponseDto {
  success!: boolean;
}

export class ReminderDeviceResponseDto {
  deviceToken!: string;
  deviceTokenId!: string;
  deviceName!: string;
  user!: AuthUserResponseDto;
}

export class ReminderRealtimeTicketResponseDto {
  ticket!: string;
  expiresAt!: string;
}

export class ReminderDeviceSummaryResponseDto {
  id!: string;
  deviceName!: string;
  createdAt!: string;
  updatedAt!: string;
  lastUsedAt!: string | null;
  revokedAt!: string | null;
}
