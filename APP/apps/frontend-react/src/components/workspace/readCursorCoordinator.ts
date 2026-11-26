type SendReadCursor = (groupId: string, eventSequence: string) => Promise<void>;
type ReportReadCursorError = (error: unknown, groupId: string) => void;

interface CursorState {
  acknowledged: bigint;
  desired: bigint;
  inFlight: Promise<void> | null;
}

export interface ReadCursorCoordinatorOptions {
  /**
   * Merge observations that arrive within this window into one request. Reading a
   * busy channel used to write a cursor per message; the unread badge is already
   * cleared locally, so a short delay is invisible to the reader.
   */
  coalesceMs?: number;
}

export class ReadCursorCoordinator {
  private readonly states = new Map<string, CursorState>();
  private readonly coalesceMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly send: SendReadCursor,
    private readonly reportError: ReportReadCursorError = () => undefined,
    options: ReadCursorCoordinatorOptions = {},
  ) {
    this.coalesceMs = Math.max(0, options.coalesceMs ?? 0);
  }

  observe(groupId: string, eventSequence: string): void {
    if (this.stopped) return;
    const observed = BigInt(eventSequence);
    const state = this.states.get(groupId) ?? {
      acknowledged: 0n,
      desired: 0n,
      inFlight: null,
    };
    if (observed > state.desired) state.desired = observed;
    this.states.set(groupId, state);

    if (this.coalesceMs > 0) {
      this.scheduleFlush();
      return;
    }
    this.sendGroup(groupId, state);
  }

  async whenIdle(groupId: string): Promise<void> {
    this.flushPending();
    const state = this.states.get(groupId);
    while (state?.inFlight) {
      await state.inFlight;
    }
  }

  /** Send the newest observed cursor now, e.g. when the tab is hidden. */
  flush(): void {
    this.flushPending();
  }

  /** Drop a pending window without stopping the coordinator (StrictMode remounts). */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.stopped = true;
    this.cancel();
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushPending();
    }, this.coalesceMs);
  }

  private flushPending(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.stopped) return;
    for (const [groupId, state] of this.states) {
      this.sendGroup(groupId, state);
    }
  }

  private sendGroup(groupId: string, state: CursorState): void {
    if (state.inFlight || state.desired <= state.acknowledged) return;
    const target = state.desired;
    let succeeded = false;
    state.inFlight = this.send(groupId, target.toString())
      .then(() => {
        succeeded = true;
        if (target > state.acknowledged) state.acknowledged = target;
      })
      .catch((error) => {
        this.reportError(error, groupId);
      })
      .finally(() => {
        state.inFlight = null;
        if (succeeded) this.sendGroup(groupId, state);
      });
  }
}
