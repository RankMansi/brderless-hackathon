import { describe, expect, it } from 'vitest';
import { toTriageHttpError } from '../server/httpErrors';

describe('triage HTTP errors', () => {
  it('does not expose provider response bodies', () => {
    const response = toTriageHttpError(
      new Error('LLM request failed (401): invalid key sk-secret-value')
    );
    expect(response).toEqual({
      status: 502,
      message: 'The triage provider rejected the request',
    });
    expect(response.message).not.toContain('sk-secret-value');
  });

  it('uses gateway timeout for model deadlines', () => {
    expect(toTriageHttpError(new Error('LLM request timed out after 20000ms'))).toEqual({
      status: 504,
      message: 'Triage generation timed out',
    });
  });

  it('uses a generic message for unexpected failures', () => {
    expect(toTriageHttpError(new Error('database password was hunter2'))).toEqual({
      status: 500,
      message: 'Unable to generate triage',
    });
  });
});
