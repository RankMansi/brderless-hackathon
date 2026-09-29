import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchTriage, shouldGenerateMissingTriage } from '../src/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('triage API errors', () => {
  it('preserves the HTTP status on API failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Provider unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const error = await fetchTriage('T-1001').catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
    expect(error.message).toBe('Provider unavailable');
  });

  it('generates only when the existing result is absent', () => {
    expect(shouldGenerateMissingTriage(new ApiError(404, 'No triage result yet'))).toBe(true);
    expect(shouldGenerateMissingTriage(new ApiError(500, 'Store unavailable'))).toBe(false);
    expect(shouldGenerateMissingTriage(new TypeError('Failed to fetch'))).toBe(false);
  });
});
