export type BackoffOptions = {
  /** Delay ceiling for the first retry. */
  baseDelayMs?: number;
  /** Delays never grow beyond this. */
  maxDelayMs?: number;
  /** Growth factor between attempts. */
  factor?: number;
  /** "Full jitter": wait a random time between 0 and the ceiling, which spreads out retry storms. */
  jitter?: boolean;
  random?: () => number;
};

export type RetryOptions = BackoffOptions & {
  /** How many times to retry after the first attempt fails. */
  retries?: number;
  /** Return false to give up immediately on errors that retrying cannot fix. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Delay before retry number `attempt` (0 = the first retry). */
export function backoffDelayMs(attempt: number, options: BackoffOptions = {}): number {
  const { baseDelayMs = 50, maxDelayMs = 2_000, factor = 2, jitter = true, random = Math.random } = options;
  const ceiling = Math.min(maxDelayMs, baseDelayMs * factor ** attempt);
  return jitter ? Math.floor(random() * ceiling) : ceiling;
}

/**
 * Runs `operation`, retrying with exponential backoff when it throws.
 * The last error is rethrown once retries are exhausted or `shouldRetry` declines.
 */
export async function retry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 2, shouldRetry = () => true, onRetry, sleep = defaultSleep } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt)) throw error;
      const delay = backoffDelayMs(attempt, options);
      onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
    }
  }
}
