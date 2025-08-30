export type Job<TInput, TResult> = {
  id: string;
  input: TInput;
  run: (input: TInput) => Promise<TResult>;
};

export class JobQueue<TInput, TResult> {
  private queue: Job<TInput, TResult>[] = [];
  private runningCount = 0;
  constructor(private readonly concurrency: number = 1) {}

  enqueue(job: Job<TInput, TResult>) {
    this.queue.push(job);
    this.tick();
  }

  private tick() {
    while (this.runningCount < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.runningCount++;
      job.run(job.input)
        .catch(() => undefined)
        .finally(() => {
          this.runningCount--;
          this.tick();
        });
    }
  }
}
