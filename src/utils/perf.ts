type PerfEntry = {
  count: number;
  totalMs: number;
  maxMs: number;
  lastLogTs: number;
};

const perfEntries = new Map<string, PerfEntry>();
const PERF_LOG_INTERVAL_MS = 1000;

export function isPerfEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as Window & { __MAZE_PERF__?: boolean }).__MAZE_PERF__);
}

export function markDuration(label: string, durationMs: number): void {
  if (!isPerfEnabled()) return;
  const existing = perfEntries.get(label);
  const now = performance.now();
  if (!existing) {
    perfEntries.set(label, {
      count: 1,
      totalMs: durationMs,
      maxMs: durationMs,
      lastLogTs: now,
    });
    return;
  }

  existing.count += 1;
  existing.totalMs += durationMs;
  existing.maxMs = Math.max(existing.maxMs, durationMs);
  if (now - existing.lastLogTs < PERF_LOG_INTERVAL_MS) return;

  const avgMs = existing.totalMs / existing.count;
  console.debug(
    `[perf] ${label}: avg=${avgMs.toFixed(2)}ms max=${existing.maxMs.toFixed(2)}ms samples=${existing.count}`,
  );
  existing.count = 0;
  existing.totalMs = 0;
  existing.maxMs = 0;
  existing.lastLogTs = now;
}

export function withPerfMeasure<T>(label: string, fn: () => T): T {
  if (!isPerfEnabled()) return fn();
  const start = performance.now();
  const result = fn();
  markDuration(label, performance.now() - start);
  return result;
}
