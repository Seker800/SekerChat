type SendReadCursor = (groupId: string, eventSequence: string) => Promise<void>;
type ReportReadCursorError = (error: unknown, groupId: string) => void;

interface CursorState {
  acknowledged: bigint;
  desired: bigint;
  inFlight: Promise<void> | null;
}

export class ReadCursorCoordinator {
  private readonly states = new Map<string, CursorState>();

  constructor(
    private readonly send: SendReadCursor,
    private readonly reportError: ReportReadCursorError = () => undefined,
  ) {}

  observe(groupId: string, eventSequence: string): void {
    const observed = BigInt(eventSequence);
    const state = this.states.get(groupId) ?? {
      acknowledged: 0n,
      desired: 0n,
      inFlight: null,
    };
    if (observed > state.desired) state.desired = observed;
    this.states.set(groupId, state);
    this.flush(groupId, state);
  }

  async whenIdle(groupId: string): Promise<void> {
    const state = this.states.get(groupId);
    while (state?.inFlight) {
      await state.inFlight;
    }
  }

  private flush(groupId: string, state: CursorState): void {
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
        if (succeeded) this.flush(groupId, state);
      });
  }
}
