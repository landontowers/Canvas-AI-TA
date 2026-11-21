import {
  LlmPort,
  LlmCapabilities,
  LlmGenerateOptions,
  LlmResponse,
  LlmUsage,
  StreamEvent,
  ToolCall,
} from '@virtual-ta/core';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface AzureOpenAiAdapterOptions {
  endpoint?: string;
  apiKey?: string;
  deployment?: string;
  apiVersion?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Azure OpenAI LlmPort adapter targeting Central US pilot/production deployments
 * (e.g., gpt-5.4-mini and gpt-5.4-nano; critique §3.9, §5).
 */
export class AzureOpenAiAdapter implements LlmPort {
  readonly providerName = 'azure-openai';
  private endpoint?: string;
  private apiKey?: string;
  private deployment: string;
  private apiVersion: string;
  private timeoutMs: number;
  private fetchFn: typeof fetch;

  constructor(options: AzureOpenAiAdapterOptions = {}) {
    this.endpoint = (options.endpoint || process.env.AZURE_OPENAI_ENDPOINT)?.replace(/\/+$/, '');
    this.apiKey = options.apiKey || process.env.AZURE_OPENAI_API_KEY;
    this.deployment = options.deployment || 'gpt-5.4-mini';
    this.apiVersion = options.apiVersion || '2025-03-01-preview';
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  getCapabilities(): LlmCapabilities {
    return {
      streaming: true,
      parallelToolCalls: true,
      reasoning: true,
      maxContextTokens: 400_000,
      structuredOutput: true,
      supportsPromptCaching: true,
    };
  }

  private buildUrl(): string {
    if (!this.endpoint || !this.apiKey) {
      throw new Error(
        'Azure OpenAI endpoint and API key must be configured (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY).',
      );
    }
    return `${this.endpoint}/openai/deployments/${encodeURIComponent(this.deployment)}/chat/completions?api-version=${encodeURIComponent(this.apiVersion)}`;
  }

  private mapMessages(options: LlmGenerateOptions) {
    const msgs: Array<Record<string, unknown>> = [
      { role: 'system', content: options.systemPrompt },
    ];
    for (const m of options.messages) {
      if (m.role === 'tool') {
        msgs.push({
          role: 'tool',
          tool_call_id: m.toolResultId || m.toolName || 'tool_call',
          content: m.content,
        });
      } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        msgs.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args || {}),
            },
          })),
        });
      } else {
        msgs.push({ role: m.role, content: m.content });
      }
    }
    return msgs;
  }

  private mapTools(options: LlmGenerateOptions) {
    if (!options.tools || options.tools.length === 0) return undefined;
    return options.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters, { target: 'jsonSchema7' }),
      },
    }));
  }

  private extractUsage(raw?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }): LlmUsage | undefined {
    if (!raw) return undefined;
    const promptTokens = raw.prompt_tokens ?? 0;
    const completionTokens = raw.completion_tokens ?? 0;
    return {
      promptTokens,
      completionTokens,
      totalTokens: raw.total_tokens ?? promptTokens + completionTokens,
    };
  }

  async generate(options: LlmGenerateOptions): Promise<LlmResponse> {
    const tools = this.mapTools(options);
    const res = await this.fetchFn(this.buildUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey!,
      },
      body: JSON.stringify({
        messages: this.mapMessages(options),
        ...(tools ? { tools } : {}),
        ...(options.maxTokens ? { max_completion_tokens: options.maxTokens } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`Azure OpenAI API error (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const msg = data.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc, idx) => {
      let args: Record<string, unknown> = {};
      try {
        args = tc.function?.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {};
      } catch {
        args = {};
      }
      return {
        id: tc.id || `call_${Date.now()}_${idx}`,
        name: tc.function?.name || 'unknown_tool',
        args,
      };
    });

    const usage = this.extractUsage(data.usage);
    return {
      text: msg?.content || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      ...(usage ? { usage } : {}),
    };
  }

  async *stream(options: LlmGenerateOptions): AsyncIterable<StreamEvent> {
    const tools = this.mapTools(options);
    const res = await this.fetchFn(this.buildUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey!,
      },
      body: JSON.stringify({
        messages: this.mapMessages(options),
        stream: true,
        stream_options: { include_usage: true },
        ...(tools ? { tools } : {}),
        ...(options.maxTokens ? { max_completion_tokens: options.maxTokens } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Azure OpenAI stream error (${res.status}): ${await res.text()}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const pendingToolCalls = new Map<number, { id: string; name: string; argsRaw: string }>();
    let latestUsage: LlmUsage | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;

        let parsed: {
          choices?: Array<{
            delta?: {
              content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        const usage = this.extractUsage(parsed.usage);
        if (usage) latestUsage = usage;

        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) {
          yield { type: 'text-delta', delta: delta.content };
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const existing = pendingToolCalls.get(idx) ?? {
              id: tc.id || `call_${Date.now()}_${idx}`,
              name: '',
              argsRaw: '',
            };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.argsRaw += tc.function.arguments;
            pendingToolCalls.set(idx, existing);
          }
        }
      }
    }

    for (const tc of pendingToolCalls.values()) {
      let args: Record<string, unknown> = {};
      try {
        args = tc.argsRaw ? (JSON.parse(tc.argsRaw) as Record<string, unknown>) : {};
      } catch {
        args = {};
      }
      yield {
        type: 'tool-status',
        callId: tc.id,
        toolName: tc.name || 'unknown_tool',
        args,
        status: 'calling',
      };
    }

    if (latestUsage) {
      yield { type: 'usage', ...latestUsage };
    }

    yield { type: 'done', conversationId: '', messageId: '' };
  }
}
