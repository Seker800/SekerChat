import { UserRole } from '@prisma/client';

export function resolveBootstrapRole(
  totalUsers: number,
  email: string,
  adminEmails: Set<string>,
  bootstrapSuperAdminEmail: string | null,
): UserRole {
  if (totalUsers === 0) {
    if (bootstrapSuperAdminEmail && email === bootstrapSuperAdminEmail) {
      return UserRole.SUPER_ADMIN;
    }
    return UserRole.MEMBER;
  }

  return adminEmails.has(email) ? UserRole.ADMIN : UserRole.MEMBER;
}

export function resolveSeedRole(existingRole: UserRole | null, totalUsers: number): UserRole {
  if (existingRole === UserRole.SUPER_ADMIN) {
    return UserRole.SUPER_ADMIN;
  }

  if (totalUsers === 0) {
    return UserRole.SUPER_ADMIN;
  }

  return UserRole.ADMIN;
}
