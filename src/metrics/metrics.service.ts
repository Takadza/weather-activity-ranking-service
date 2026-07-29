import { Injectable } from '@nestjs/common';

/**
 * Minimal in-process Prometheus text metrics (H9).
 */
@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();

  increment(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    for (const [name, value] of [...this.counters.entries()].sort()) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }
}
