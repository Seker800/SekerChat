export const FILE_SHARE_PASSWORD_LENGTH = 16;
export const MANAGED_FILE_SHARE_PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{12,64}$/;
export const PUBLIC_FILE_SHARE_PASSWORD_PATTERN = /^[A-Za-z\d]{4,64}$/;

export function isManagedFileSharePassword(password: string): boolean {
  return MANAGED_FILE_SHARE_PASSWORD_PATTERN.test(password);
}
