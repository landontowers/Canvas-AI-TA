import { describe, it, expect } from 'vitest';
import { LlmPort } from '@ai-tutor/core';

export function runLlmContractTests(name: string, createAdapter: () => LlmPort | Promise<LlmPort>) {
  describe(`LLM Port Contract: ${name}`, () => {
    it('provides capabilities descriptor', async () => {
      const adapter = await createAdapter();
      const caps = adapter.getCapabilities();

      expect(caps).toHaveProperty('streaming');
      expect(caps).toHaveProperty('parallelToolCalls');
      expect(caps).toHaveProperty('maxContextTokens');
      expect(typeof caps.maxContextTokens).toBe('number');
    });

    it('generates a response for a basic prompt', async () => {
      const adapter = await createAdapter();
      const response = await adapter.generate({
        systemPrompt: 'You are a tutor',
        messages: [{ role: 'user', content: 'What is safety protocol #1?' }],
      });

      expect(response).toBeDefined();
      expect(typeof response.text).toBe('string');
      expect(response.text.length).toBeGreaterThan(0);
    });

    it('streams response events culminating in done event', async () => {
      const adapter = await createAdapter();
      const stream = adapter.stream({
        systemPrompt: 'You are a tutor',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();
    });
  });
}
