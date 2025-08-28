export type Job<TInput, TResult> = {
  id: string;
  input: TInput;
  run: (input: TInput) => Promise<TResult>;
};

export class JobQueue<TInput, TResult> {
  private queue: Job<TInput, TResult>[] = [];
  private running = false;

  enqueue(job: Job<TInput, TResult>) {
    this.queue.push(job);
    this.tick();
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;
        await job.run(job.input);
      }
    } finally {
      this.running = false;
    }
  }
}
