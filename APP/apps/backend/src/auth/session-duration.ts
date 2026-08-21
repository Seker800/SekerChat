export function parseDurationToMilliseconds(value: string): number {
  const matcher = /^(\d+)(ms|s|m|h|d)$/i.exec(value.trim());
  if (!matcher) {
    throw new Error(`Invalid duration format: ${value}`);
  }

  const amount = Number(matcher[1]);
  const unit = matcher[2].toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return amount * multipliers[unit];
}

export function parseDurationToSeconds(value: string): number {
  const milliseconds = parseDurationToMilliseconds(value);
  return Math.max(1, Math.floor(milliseconds / 1_000));
}
