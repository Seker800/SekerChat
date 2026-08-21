import {
  MediaLoadScheduler,
  getRecommendedMediaConcurrency,
  type MediaLoadPriority,
} from '../../media/loading/mediaLoadScheduler';

export { getRecommendedMediaConcurrency };
export type { MediaLoadPriority };

export interface MediaLoadTask {
  id: string;
  priority: MediaLoadPriority;
  bottom: number;
  run: (signal: AbortSignal) => Promise<void>;
}

export class MessageMediaScheduler {
  private readonly scheduler: MediaLoadScheduler;

  constructor({
    maxConcurrent = getRecommendedMediaConcurrency(),
  }: { maxConcurrent?: number } = {}) {
    this.scheduler = new MediaLoadScheduler({ maxConcurrent });
  }

  enqueue(task: MediaLoadTask): () => void {
    return this.scheduler.enqueue({
      id: task.id,
      priority: task.priority,
      order: task.bottom,
      run: task.run,
    });
  }

  clear({ abortActive = false }: { abortActive?: boolean } = {}) {
    this.scheduler.clear({ abortActive });
  }
}
