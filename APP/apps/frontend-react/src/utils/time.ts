export function formatRelativeTime(value: string): string {
  const now = Date.now();
  const target = new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round((now - target) / 60_000));

  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}天`;

  const diffWeeks = Math.round(diffDays / 7);
  return `${diffWeeks}周`;
}

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
