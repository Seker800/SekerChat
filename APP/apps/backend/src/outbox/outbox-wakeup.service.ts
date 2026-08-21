import { Injectable } from '@nestjs/common';

type OutboxWakeupListener = () => void;

@Injectable()
export class OutboxWakeupService {
  private readonly listeners = new Set<OutboxWakeupListener>();

  notify(): void {
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: OutboxWakeupListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
