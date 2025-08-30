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
  private controllers = new Map<string, AbortController>();
  private queue = new JobQueue<TInput, void>(Number(process.env.COMPILE_CONCURRENCY || 1));

  create(input: TInput, run: (input: TInput, signal: AbortSignal) => Promise<TResult>): string {
    const id = crypto.randomUUID();
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.operations.set(id, { id, state: 'queued' });
    this.queue.enqueue({
      id,
      input,
      run: async (inp) => {
        const op = this.operations.get(id);
        if (!op) return;
        op.state = 'running';
        try {
          const result = await run(inp, controller.signal);
          // If cancelled mid-run, respect cancelled state
          if (this.operations.get(id)?.state === 'cancelled') return;
          op.result = result;
          op.state = 'succeeded';
        } catch (e: any) {
          if (this.operations.get(id)?.state === 'cancelled') return;
          op.error = String(e?.message || e);
          op.state = 'failed';
        } finally {
          this.controllers.delete(id);
        }
      },
    });
    return id;
  }

  cancel(id: string): boolean {
    const op = this.operations.get(id);
    if (!op) return false;
    if (op.state === 'queued' || op.state === 'running') {
      op.state = 'cancelled';
      const controller = this.controllers.get(id);
      if (controller) controller.abort();
      return true;
    }
    return false;
  }

  get(id: string): Operation<TResult> | undefined {
    return this.operations.get(id);
  }
}
