import { afterEach, describe, expect, it } from 'vitest';
import { getLLMClient, setLLMClient } from '../server/llm/client';
import { MockLLM } from '../server/llm/mock';

const originalProvider = process.env.LLM_PROVIDER;

afterEach(() => {
  if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = originalProvider;
  setLLMClient(null);
});

describe('LLM provider configuration', () => {
  it('uses the mock only when it is explicitly selected', () => {
    process.env.LLM_PROVIDER = 'mock';
    expect(getLLMClient()).toBeInstanceOf(MockLLM);
  });

  it('rejects an unknown provider instead of silently using the mock', () => {
    process.env.LLM_PROVIDER = 'opneai';
    expect(() => getLLMClient()).toThrow(/unsupported LLM_PROVIDER.*opneai/i);
  });
});
