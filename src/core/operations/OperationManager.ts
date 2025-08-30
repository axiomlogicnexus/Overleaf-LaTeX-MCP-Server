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
  private inputs = new Map<string, TInput>();
  private queue = new JobQueue<TInput, void>(Number(process.env.COMPILE_CONCURRENCY || 1));

  create(input: TInput, run: (input: TInput, signal: AbortSignal) => Promise<TResult>): string {
    const id = crypto.randomUUID();
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.operations.set(id, { id, state: 'queued' });
    this.inputs.set(id, input);
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
        } finally {
          // Keep inputs for running/queued only; drop when terminal
          const cur = this.operations.get(id)?.state;
          if (!cur || cur === 'succeeded' || cur === 'failed' || cur === 'cancelled') {
            this.inputs.delete(id);
          }
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

  summary() {
    const conc = Number(process.env.COMPILE_CONCURRENCY || 1);
    let running = 0, queued = 0;
    const perProject: Record<string, { running: number; queued: number }> = {};
    for (const [id, op] of this.operations.entries()) {
      if (op.state === 'running' || op.state === 'queued') {
        const inp: any = this.inputs.get(id) || {};
        const projectId = inp.workspaceId || inp.projectId || 'unknown';
        if (!perProject[projectId]) perProject[projectId] = { running: 0, queued: 0 };
        if (op.state === 'running') { running++; perProject[projectId].running++; }
        else if (op.state === 'queued') { queued++; perProject[projectId].queued++; }
      }
    }
    return { concurrency: conc, running, queued, perProject };
  }
}
