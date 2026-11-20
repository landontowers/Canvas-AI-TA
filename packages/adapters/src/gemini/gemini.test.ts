import { describe, it, expect, vi } from 'vitest';
import { GeminiAdapter } from './gemini.adapter.js';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn(),
    ThinkingLevel: {
      LOW: 'LOW',
      MINIMAL: 'MINIMAL',
      MEDIUM: 'MEDIUM',
      HIGH: 'HIGH',
    },
  };
});

describe('GeminiAdapter Unit & Resilience Suite', () => {
  it('throws error when no API key is provided and generate/stream is called', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const adapter = new GeminiAdapter();
    expect(adapter.providerName).toBe('gemini');

    await expect(
      adapter.generate({
        messages: [{ role: 'user', content: 'hello' }],
        systemPrompt: 'test',
      }),
    ).rejects.toThrow('Gemini API key is not configured');

    const stream = adapter.stream({
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: 'test',
    });
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow('Gemini API key is not configured');

    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });

  it('reports accurate capabilities', () => {
    const adapter = new GeminiAdapter({ apiKey: 'test-key' });
    const caps = adapter.getCapabilities();

    expect(caps.streaming).toBe(true);
    expect(caps.parallelToolCalls).toBe(true);
    expect(caps.reasoning).toBe(true);
    expect(caps.structuredOutput).toBe(true);
    expect(caps.maxContextTokens).toBe(1_000_000);
  });

  it('generates text and handles tool calls with thoughtSignature preservation', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      text: 'Here is your answer.',
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  id: 'call_123',
                  name: 'get_syllabus',
                  args: { courseId: '101' },
                },
                thoughtSignature: 'sig_abc123',
              },
            ],
          },
        },
      ],
    });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const adapter = new GeminiAdapter({
      apiKey: 'test-key',
      defaultModel: 'gemini-3.8-flash',
    });

    const response = await adapter.generate({
      messages: [
        { role: 'user', content: 'What is the syllabus?' },
        {
          role: 'assistant',
          content: 'Let me check.',
          toolCalls: [
            {
              id: 'call_prev',
              name: 'lookup',
              args: {},
              thoughtSignature: 'prev_sig',
            },
          ],
        },
        {
          role: 'tool',
          content: 'syllabus data',
          toolName: 'lookup',
          toolResultId: 'call_prev',
        },
      ],
      systemPrompt: 'You are an AI Tutor.',
      tools: [
        {
          name: 'get_syllabus',
          description: 'Fetch syllabus',
          parameters: z.object({
            courseId: z.string().describe('The course ID'),
            level: z.number().min(1).max(5).optional(),
          }),
          requiredRole: 'both',
          requiredScopes: [],
        },
      ],
    });

    expect(response.text).toBe('Here is your answer.');
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].name).toBe('get_syllabus');
    expect(response.toolCalls![0].thoughtSignature).toBe('sig_abc123');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('falls back to fallbackModel on recoverable 429 quota exhaustion', async () => {
    const mockGenerateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error('ResourceExhausted: 429 Quota limit reached'))
      .mockResolvedValueOnce({
        text: 'Recovered answer from fallback model.',
        candidates: [],
      });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const adapter = new GeminiAdapter({
      apiKey: 'test-key',
      defaultModel: 'gemini-3.8-flash',
      fallbackModel: 'gemini-3.5-flash-lite',
    });

    const response = await adapter.generate({
      messages: [{ role: 'user', content: 'test question' }],
      systemPrompt: 'prompt',
    });

    expect(response.text).toBe('Recovered answer from fallback model.');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-3.8-flash');
    expect(mockGenerateContent.mock.calls[1][0].model).toBe('gemini-3.5-flash-lite');
  });

  it('rethrows non-recoverable error immediately', async () => {
    const mockGenerateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error('InvalidAPIKey: 400 Bad Request'));

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    const adapter = new GeminiAdapter({ apiKey: 'bad-key' });

    await expect(
      adapter.generate({
        messages: [{ role: 'user', content: 'test' }],
        systemPrompt: 'prompt',
      }),
    ).rejects.toThrow('InvalidAPIKey');
  });

  it('streams text chunks and tool status events, with stream error recovery', async () => {
    async function* primaryStream() {
      yield { text: 'Hello ' };
      throw new Error('503 Service Unavailable Overloaded');
    }

    async function* fallbackStream() {
      yield { text: 'world from fallback!' };
      yield {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    id: 'fc_stream_1',
                    name: 'calculator',
                    args: { expr: '2+2' },
                  },
                  thoughtSignature: 'stream_sig',
                },
              ],
            },
          },
        ],
      };
    }

    const mockGenerateContentStream = vi
      .fn()
      .mockImplementation(({ model }) => {
        if (model === 'gemini-3.8-flash') {
          return primaryStream();
        }
        return fallbackStream();
      });

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContentStream: mockGenerateContentStream,
      },
    }));

    const adapter = new GeminiAdapter({
      apiKey: 'test-key',
      defaultModel: 'gemini-3.8-flash',
      fallbackModel: 'gemini-3.5-flash-lite',
    });

    const stream = adapter.stream({
      messages: [{ role: 'user', content: 'Calculate 2+2' }],
      systemPrompt: 'prompt',
    });

    const events = [];
    for await (const event of stream) {
      events.push(event);
    }

    const textDeltas = events.filter((e) => e.type === 'text-delta').map((e: any) => e.delta).join('');
    expect(textDeltas).toContain('Hello ');
    expect(textDeltas).toContain('world from fallback!');

    const toolEvents = events.filter((e) => e.type === 'tool-status');
    expect(toolEvents).toHaveLength(1);
    expect((toolEvents[0] as any).toolName).toBe('calculator');
    expect((toolEvents[0] as any).thoughtSignature).toBe('stream_sig');
  });

  it('maps reasoning levels to ThinkingLevel config and extracts usageMetadata in generate() and stream()', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      text: 'Analyzed carefully.',
      candidates: [],
      usageMetadata: {
        promptTokenCount: 150,
        candidatesTokenCount: 40,
        totalTokenCount: 210,
        thoughtsTokenCount: 20,
      },
    });

    async function* streamWithUsage() {
      yield { text: 'Streaming part ' };
      yield {
        text: 'done.',
        usageMetadata: {
          promptTokenCount: 80,
          candidatesTokenCount: 12,
          totalTokenCount: 92,
        },
      };
    }

    const mockGenerateContentStream = vi.fn().mockImplementation(() => streamWithUsage());

    (GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
        generateContentStream: mockGenerateContentStream,
      },
    }));

    const adapter38 = new GeminiAdapter({ apiKey: 'test-key', defaultModel: 'gemini-3.8-flash' });
    const genRes = await adapter38.generate({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: 'full',
    });
    expect(mockGenerateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH',
    });
    expect(genRes.usage).toEqual({
      promptTokens: 150,
      completionTokens: 40,
      totalTokens: 210,
      thoughtsTokens: 20,
    });

    await adapter38.generate({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: 'off',
    });
    expect(mockGenerateContent.mock.calls[1][0].config.thinkingConfig).toBeUndefined();

    const adapter35 = new GeminiAdapter({ apiKey: 'test-key', defaultModel: 'gemini-3.5-flash-lite' });
    await adapter35.generate({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: 'full',
    });
    expect(mockGenerateContent.mock.calls[2][0].config.thinkingConfig).toEqual({
      thinkingLevel: 'MEDIUM',
    });

    const streamEvents = [];
    for await (const ev of adapter38.stream({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      reasoning: 'minimal',
    })) {
      streamEvents.push(ev);
    }
    const usageEv = streamEvents.find((e) => e.type === 'usage') as any;
    expect(usageEv).toEqual({
      type: 'usage',
      promptTokens: 80,
      completionTokens: 12,
      totalTokens: 92,
    });
  });
});
