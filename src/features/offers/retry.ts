/** Retentativas com backoff exponencial e limite de requisições por conector. Relógio e espera injetáveis (testáveis). */
export type RetryOptions = { retries?: number; baseMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void>; isRetryable?: (e: unknown) => boolean; onRetry?: (attempt: number, delayMs: number, e: unknown) => void };

export class NonRetryableError extends Error {}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions = {}): Promise<T> {
  const retries = o.retries ?? 3;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      last = e;
      const retryable = e instanceof NonRetryableError ? false : (o.isRetryable ? o.isRetryable(e) : true);
      if (!retryable || attempt === retries) break;
      const delay = Math.min(o.maxMs ?? 30_000, (o.baseMs ?? 500) * 2 ** attempt);
      o.onRetry?.(attempt + 1, delay, e);
      await sleep(delay);
    }
  }
  throw last;
}

/** Janela deslizante: no máximo `max` chamadas a cada `perMs`. `acquire` espera o que for preciso. */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(private readonly max: number, private readonly perMs: number, private readonly now: () => number = Date.now, private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}
  async acquire(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < this.perMs);
      if (this.stamps.length < this.max) { this.stamps.push(t); return; }
      await this.sleep(Math.max(1, this.perMs - (t - this.stamps[0])));
    }
  }
}
