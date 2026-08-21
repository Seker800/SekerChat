import type { SubscriptionPost, SubscriptionPostInput } from '../../../lib/subscriptions-api';

interface SubscriptionDraftControllerOptions {
  draftId?: string;
  create: (input: SubscriptionPostInput) => Promise<SubscriptionPost>;
  update: (draftId: string, input: SubscriptionPostInput) => Promise<SubscriptionPost>;
  onSaved?: (post: SubscriptionPost) => void;
}

function copyInput(input: SubscriptionPostInput): SubscriptionPostInput {
  return { title: input.title, body: input.body, tags: [...input.tags] };
}

export class SubscriptionDraftController {
  private draftId: string;
  private latestInput: SubscriptionPostInput | null = null;
  private latestRevision = 0;
  private savedRevision = 0;
  private running: Promise<void> | null = null;

  constructor(private readonly options: SubscriptionDraftControllerOptions) {
    this.draftId = options.draftId ?? '';
  }

  save(input: SubscriptionPostInput): Promise<void> {
    this.latestInput = copyInput(input);
    this.latestRevision += 1;
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  async ensureDraft(input: SubscriptionPostInput): Promise<string> {
    await this.save(input);
    if (!this.draftId) throw new Error('文章草稿创建失败。');
    return this.draftId;
  }

  get id(): string {
    return this.draftId;
  }

  private async drain(): Promise<void> {
    while (this.latestInput && this.savedRevision < this.latestRevision) {
      const revision = this.latestRevision;
      const input = copyInput(this.latestInput);
      const post = this.draftId
        ? await this.options.update(this.draftId, input)
        : await this.options.create(input);
      this.draftId = post.id;
      this.savedRevision = revision;
      this.options.onSaved?.(post);
    }
  }
}
