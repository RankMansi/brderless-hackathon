import { MockLLM } from './mock';
import { llmTimeoutMs } from './timeout';

export interface CompletionRequest {
  system: string;
  user: string;
  temperature?: number;
}

export interface LLMClient {
  complete(req: CompletionRequest): Promise<string>;
}

class OpenAICompatibleClient implements LLMClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string
  ) {}

  async complete(req: CompletionRequest): Promise<string> {
    const timeoutMs = llmTimeoutMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: req.temperature ?? 0.3,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
        }),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        throw new Error(`LLM request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 500)}`);
    }
    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return json.choices[0]?.message?.content ?? '';
  }
}

let client: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (client) return client;
  const provider = process.env.LLM_PROVIDER ?? 'mock';
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('LLM_PROVIDER=gemini requires GEMINI_API_KEY to be set');
    }
    // Gemini's OpenAI-compatible endpoint
    client = new OpenAICompatibleClient(
      process.env.GEMINI_BASE_URL ??
        'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey,
      process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
    );
  } else if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('LLM_PROVIDER=openai requires OPENAI_API_KEY to be set');
    }
    client = new OpenAICompatibleClient(
      process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKey,
      process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    );
  } else {
    client = new MockLLM();
  }
  return client;
}

// For tests: swap in a custom client.
export function setLLMClient(c: LLMClient | null): void {
  client = c;
}
