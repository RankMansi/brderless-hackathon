export function llmTimeoutMs(): number {
  const raw = process.env.LLM_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === '') return 20_000;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`LLM_TIMEOUT_MS must be a positive number, got ${raw}`);
  }
  return ms;
}

/** Rejects if the model call does not settle. The caller must not store a result after this rejects. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`LLM request timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
