import type { User } from '@prisma/client';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'mustChangePassword'>;
}
