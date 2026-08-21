import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reminderSource = readFileSync(
  resolve(process.cwd(), 'src/index.ts'),
  'utf8',
);
const androidSource = readFileSync(
  resolve(
    process.cwd(),
    '../mobile-shell/android/app/src/main/java/com/sekerchat/android/BackgroundService.java',
  ),
  'utf8',
);

describe('device credential leak gate', () => {
  it('keeps long-lived device tokens out of WebSocket URLs and connection logs', () => {
    expect(reminderSource).not.toMatch(/realtime\?deviceToken|searchParams\.set\(['"]deviceToken|url:\s*realtimeUrl/);
    expect(androidSource).not.toMatch(/realtime\?deviceToken|connecting to\s*"?\s*\+\s*wsUrl/);
    expect(reminderSource).toContain("'x-reminder-device-token': session.deviceToken");
    expect(androidSource).toContain('.header("x-reminder-device-token", deviceToken)');
  });
});
