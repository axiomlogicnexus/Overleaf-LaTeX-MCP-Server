import { JobQueue } from '../queue/JobQueue';
import crypto from 'node:crypto';

export type OperationState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Operation<T> {
  id: string;
  state: OperationState;
  progress?: number;
  result?: T;
  error?: string;
}

export class OperationManager<TInput, TResult> {
  private operations = new Map<string, Operation<TResult>>();
  private queue = new JobQueue<TInput, void>();

  create(input: TInput, run: (input: TInput) => Promise<TResult>): string {
    const id = crypto.randomUUID();
    this.operations.set(id, { id, state: 'queued' });
    this.queue.enqueue({
      id,
      input,
      run: async (inp) => {
        const op = this.operations.get(id);
        if (!op) return;
        op.state = 'running';
        try {
          const result = await run(inp);
          op.result = result;
          op.state = 'succeeded';
        } catch (e: any) {
          op.error = String(e?.message || e);
          op.state = 'failed';
        }
      },
    });
    return id;
  }

  get(id: string): Operation<TResult> | undefined {
    return this.operations.get(id);
  }
}
