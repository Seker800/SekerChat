export function formatRelativeTime(value: string, locale = 'zh-CN'): string {
  const now = Date.now();
  const target = new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round((now - target) / 60_000));

  const english = locale.toLowerCase().startsWith('en');
  if (diffMinutes < 1) return english ? 'just now' : '刚刚';
  if (diffMinutes < 60) return english ? `${diffMinutes}m` : `${diffMinutes}分`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return english ? `${diffHours}h` : `${diffHours}小时`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return english ? `${diffDays}d` : `${diffDays}天`;

  const diffWeeks = Math.round(diffDays / 7);
  return english ? `${diffWeeks}w` : `${diffWeeks}周`;
}

export function formatTimestamp(value: string, locale = 'zh-CN'): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
