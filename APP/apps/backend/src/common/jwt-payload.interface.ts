export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  displayName?: string | null;
  actorType?: 'AGENT_BOT' | 'CLI_BOT' | 'HUMAN';
  mustChangePassword?: boolean;
  authVersion?: number;
  jti?: string;
}
