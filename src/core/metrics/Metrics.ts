export class Metrics {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  inc(name: string, value = 1) {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }
  observe(name: string, value: number) {
    const a = this.histograms.get(name) || [];
    a.push(value);
    this.histograms.set(name, a);
  }

  renderProm(): string {
    const lines: string[] = [];
    for (const [k, v] of this.counters) {
      lines.push(`# TYPE ${k} counter`);
      lines.push(`${k} ${v}`);
    }
    for (const [k, arr] of this.histograms) {
      lines.push(`# TYPE ${k} summary`);
      if (arr.length === 0) { lines.push(`${k}_count 0`); continue; }
      const sum = arr.reduce((a, b) => a + b, 0);
      lines.push(`${k}_count ${arr.length}`);
      lines.push(`${k}_sum ${sum}`);
    }
    return lines.join('\n') + '\n';
  }
}
