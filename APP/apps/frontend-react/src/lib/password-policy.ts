export function validateNewPassword(password: string): string | null {
  if (password.length < 8) return '密码至少需要 8 个字符。';
  if (!/[A-Z]/.test(password)) return '密码至少需要一个大写字母。';
  if (!/[a-z]/.test(password)) return '密码至少需要一个小写字母。';
  if (!/[0-9]/.test(password)) return '密码至少需要一个数字。';
  return null;
}
