export interface HttpErrorResponse {
  status: number;
  message: string;
}

export function toTriageHttpError(error: unknown): HttpErrorResponse {
  const message = error instanceof Error ? error.message : String(error);

  if (/timed out/i.test(message)) {
    return { status: 504, message: 'Triage generation timed out' };
  }
  if (/LLM request failed \(429\)/.test(message)) {
    return { status: 503, message: 'The triage provider is temporarily unavailable' };
  }
  if (/LLM request failed \((?:401|403)\)/.test(message)) {
    return { status: 502, message: 'The triage provider rejected the request' };
  }
  if (
    /LLM request failed|model response|no JSON object|internal notes/i.test(message)
  ) {
    return { status: 502, message: 'The triage provider returned an unusable response' };
  }
  return { status: 500, message: 'Unable to generate triage' };
}
