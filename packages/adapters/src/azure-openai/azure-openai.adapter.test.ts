import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { AzureOpenAiAdapter } from './azure-openai.adapter.js';
import { runLlmContractTests } from '../contracts/llm.contract.js';

function createMockAzureFetch(): typeof fetch {
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    if (body.stream) {
      const encoder = new TextEncoder();
      const sse = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Safety ' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'first.' } }] })}\n\n`,
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, id: 'call_1', function: { name: 'get_syllabus', arguments: '{"x":1}' } }],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })}\n\n`,
        'data: [DONE]\n\n',
      ];
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of sse) controller.enqueue(encoder.encode(chunk));
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    }

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Always verify chamber clearance first.', tool_calls: [] } }],
        usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
}

describe('AzureOpenAiAdapter', () => {
  runLlmContractTests(
    'AzureOpenAiAdapter',
    () =>
      new AzureOpenAiAdapter({
        endpoint: 'https://sdi-pilot.openai.azure.com',
        apiKey: 'test-azure-key',
        deployment: 'gpt-5.4-mini',
        fetchFn: createMockAzureFetch(),
      }),
  );

  it('streams tool calls and usage events and maps tool schemas', async () => {
    const mockFetch = createMockAzureFetch();
    const adapter = new AzureOpenAiAdapter({
      endpoint: 'https://sdi-pilot.openai.azure.com/',
      apiKey: 'test-azure-key',
      deployment: 'gpt-5.4-mini',
      fetchFn: mockFetch,
    });

    const events = [];
    for await (const ev of adapter.stream({
      systemPrompt: 'Sys',
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'c0', name: 'calc', args: {} }] },
        { role: 'tool', toolResultId: 'c0', toolName: 'calc', content: '42' },
      ],
      tools: [
        {
          name: 'get_syllabus',
          description: 'Get syllabus',
          parameters: z.object({ x: z.number().optional() }),
          requiredRole: 'both',
          requiredScopes: [],
        },
      ],
    })) {
      events.push(ev);
    }

    expect(events.some((e) => e.type === 'text-delta' && e.delta === 'Safety ')).toBe(true);
    expect(events.some((e) => e.type === 'tool-status' && e.toolName === 'get_syllabus')).toBe(true);
    expect(events.some((e) => e.type === 'usage' && e.totalTokens === 15)).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('throws clear error when endpoint or key is missing', async () => {
    const adapter = new AzureOpenAiAdapter({ endpoint: '', apiKey: '' });
    await expect(
      adapter.generate({ systemPrompt: 'Sys', messages: [{ role: 'user', content: 'Hi' }] }),
    ).rejects.toThrow(/Azure OpenAI endpoint and API key/i);
  });
});
