/** In-memory optimization only: durable queues remain authoritative; fallback never exceeds a minute. */
export class IdlePollSchedule {
  private nextAt = 0;
  private delayMs = 10_000;

  ready(now = Date.now()): boolean {
    return now >= this.nextAt;
  }

  idle(now = Date.now()): void {
    this.nextAt = now + this.delayMs;
    this.delayMs = Math.min(60_000, this.delayMs * 2);
  }

  wake(): void {
    this.nextAt = 0;
    this.delayMs = 10_000;
  }
}
