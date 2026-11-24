import {
  LlmPort,
  LlmCapabilities,
  LlmGenerateOptions,
  LlmResponse,
  LlmUsage,
  StreamEvent,
  ToolCall,
} from '@virtual-ta/core';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface GeminiAdapterOptions {
  apiKey?: string;
  vertexai?: boolean;
  project?: string;
  location?: string;
  defaultModel?: string;
  fallbackModel?: string;
  timeout?: number;
}

export class GeminiAdapter implements LlmPort {
  readonly providerName = 'gemini';
  private client?: GoogleGenAI;
  private defaultModel: string;
  private fallbackModel: string;

  constructor(options: GeminiAdapterOptions = {}) {
    const useVertex = options.vertexai ?? process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';
    const project = options.project || process.env.GOOGLE_CLOUD_PROJECT;
    const location = options.location || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    const key = options.apiKey || process.env.GEMINI_API_KEY;

    if (useVertex && project) {
      this.client = new GoogleGenAI({
        vertexai: true,
        project,
        location,
        httpOptions: {
          timeout: options.timeout ?? 60000,
        },
      });
    } else if (key) {
      this.client = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          timeout: options.timeout ?? 60000,
        },
      });
    }
    this.defaultModel = options.defaultModel || 'gemini-3.6-flash';
    this.fallbackModel = options.fallbackModel || 'gemini-3.7-flash';
  }

  getCapabilities(): LlmCapabilities {
    return {
      streaming: true,
      parallelToolCalls: true,
      reasoning: true,
      maxContextTokens: 1_000_000,
      structuredOutput: true,
      supportsPromptCaching: true,
    };
  }

  private mapMessagesToContents(options: LlmGenerateOptions) {
    return options.messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          parts: [
            {
              functionResponse: {
                name: m.toolName || m.toolResultId || 'tool_response',
                response: { output: m.content },
              },
            },
          ],
        };
      }

      if (m.role === 'assistant') {
        const parts: Array<Record<string, unknown>> = [];
        if (m.content) {
          parts.push({ text: m.content });
        }
        if (m.toolCalls && m.toolCalls.length > 0) {
          for (const tc of m.toolCalls) {
            const partObj: Record<string, unknown> = {
              functionCall: {
                id: tc.id,
                name: tc.name,
                args: tc.args || {},
              },
            };
            if (tc.thoughtSignature) {
              partObj.thoughtSignature = tc.thoughtSignature;
            }
            parts.push(partObj);
          }
        }
        if (parts.length === 0) {
          parts.push({ text: '' });
        }
        return {
          role: 'model' as const,
          parts,
        };
      }

      return {
        role: 'user' as const,
        parts: [{ text: m.content }],
      };
    });
  }

  private sanitizeSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(schema)) {
      if (key === '$schema' || key === 'additionalProperties') continue;
      if (key === 'exclusiveMinimum' && typeof val === 'boolean') {
        if (typeof schema.minimum === 'number') {
          clean.minimum = schema.minimum;
        }
        continue;
      }
      if (key === 'exclusiveMaximum' && typeof val === 'boolean') {
        if (typeof schema.maximum === 'number') {
          clean.maximum = schema.maximum;
        }
        continue;
      }
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        clean[key] = this.sanitizeSchemaForGemini(val as Record<string, unknown>);
      } else if (Array.isArray(val)) {
        clean[key] = val.map((item) =>
          item && typeof item === 'object' ? this.sanitizeSchemaForGemini(item as Record<string, unknown>) : item,
        );
      } else {
        clean[key] = val;
      }
    }
    return clean;
  }

  private mapToolsToGemini(options: LlmGenerateOptions) {
    if (!options.tools || options.tools.length === 0) return undefined;

    const functionDeclarations = options.tools.map((t) => {
      const jsonSchema = zodToJsonSchema(t.parameters, { target: 'openApi3' });
      const cleanSchema = this.sanitizeSchemaForGemini(jsonSchema as Record<string, unknown>);

      return {
        name: t.name,
        description: t.description,
        parametersJsonSchema: cleanSchema,
      };
    });

    return [{ functionDeclarations }];
  }

  private getThinkingConfig(
    model: string,
    reasoning: LlmGenerateOptions['reasoning'] = 'minimal',
  ) {
    if (reasoning === 'off') {
      return {};
    }
    if (model.includes('3.8')) {
      return {
        thinkingConfig: {
          thinkingLevel: reasoning === 'full' ? ThinkingLevel.HIGH : ThinkingLevel.LOW,
        },
      };
    }
    if (model.includes('3.5') || model.includes('3.6')) {
      return {
        thinkingConfig: {
          thinkingLevel: reasoning === 'full' ? ThinkingLevel.MEDIUM : ThinkingLevel.MINIMAL,
        },
      };
    }
    return {};
  }

  private extractUsage(
    meta?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
      thoughtsTokenCount?: number;
    } | null,
  ): LlmUsage | undefined {
    if (!meta) return undefined;
    const promptTokens = meta.promptTokenCount ?? 0;
    const completionTokens = meta.candidatesTokenCount ?? 0;
    const totalTokens = meta.totalTokenCount ?? promptTokens + completionTokens;
    return {
      promptTokens,
      completionTokens,
      totalTokens,
      ...(meta.thoughtsTokenCount !== undefined ? { thoughtsTokens: meta.thoughtsTokenCount } : {}),
    };
  }

  private isRecoverableError(err: unknown): boolean {
    const rawMsg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : '';
    if (!rawMsg) return false;
    const msg = rawMsg.toLowerCase();
    return (
      msg.includes('quota') ||
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('rate') ||
      msg.includes('limit') ||
      msg.includes('aborted') ||
      msg.includes('timeout') ||
      msg.includes('503') ||
      msg.includes('unavailable') ||
      msg.includes('overloaded') ||
      msg.includes('high demand') ||
      msg.includes('try again') ||
      msg.includes('404') ||
      msg.includes('not found')
    );
  }

  private getModelCascade(): string[] {
    const candidates = [
      this.defaultModel,
      this.fallbackModel,
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
    ];
    return Array.from(new Set(candidates.filter(Boolean)));
  }

  async generate(options: LlmGenerateOptions): Promise<LlmResponse> {
    if (!this.client) {
      throw new Error(
        'Gemini API key is not configured. Set GEMINI_API_KEY in .env or provide it to GeminiAdapter.',
      );
    }

    const contents = this.mapMessagesToContents(options);
    const tools = this.mapToolsToGemini(options);

    const callModel = async (model: string) => {
      const thinking = this.getThinkingConfig(model, options.reasoning);
      return this.client!.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: options.systemPrompt,
          maxOutputTokens: options.maxTokens,
          temperature: options.temperature,
          ...thinking,
          ...(tools ? { tools } : {}),
        },
      });
    };

    const models = this.getModelCascade();
    let response;
    let lastErr: unknown;
    for (let i = 0; i < models.length; i++) {
      try {
        response = await callModel(models[i]);
        break;
      } catch (err: unknown) {
        lastErr = err;
        if (!this.isRecoverableError(err) || i === models.length - 1) {
          throw err;
        }
      }
    }
    if (!response) {
      throw lastErr;
    }

    const text = response.text || '';
    const toolCalls: ToolCall[] = [];

    if (response.candidates) {
      for (const cand of response.candidates) {
        for (const part of cand.content?.parts || []) {
          if (part.functionCall) {
            const fc = part.functionCall;
            toolCalls.push({
              id: fc.id || `call_${Date.now()}_${fc.name || 'tool'}`,
              name: fc.name || 'unknown_tool',
              args: (fc.args as Record<string, unknown>) || {},
              thoughtSignature: (part as Record<string, unknown>).thoughtSignature as string | undefined,
            });
          }
        }
      }
    }

    const usage = this.extractUsage(response.usageMetadata);

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      ...(usage ? { usage } : {}),
    };
  }

  async *stream(options: LlmGenerateOptions): AsyncIterable<StreamEvent> {
    if (!this.client) {
      throw new Error(
        'Gemini API key is not configured. Set GEMINI_API_KEY in .env or provide it to GeminiAdapter.',
      );
    }

    const contents = this.mapMessagesToContents(options);
    const tools = this.mapToolsToGemini(options);

    const getStream = (model: string) => {
      const thinking = this.getThinkingConfig(model, options.reasoning);
      return this.client!.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: options.systemPrompt,
          maxOutputTokens: options.maxTokens,
          temperature: options.temperature,
          ...thinking,
          ...(tools ? { tools } : {}),
        },
      });
    };

    const consumeStream = async function* (
      adapter: GeminiAdapter,
      iterable: AsyncIterable<{
        text?: string;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
          thoughtsTokenCount?: number;
        };
        candidates?: Array<{
          content?: {
            parts?: Array<{
              functionCall?: { id?: string; name?: string; args?: unknown };
              thoughtSignature?: string;
            }>;
          };
        }>;
      }>,
    ): AsyncIterable<StreamEvent> {
      let latestUsage: LlmUsage | undefined;
      for await (const chunk of iterable) {
        if (chunk.text) {
          yield {
            type: 'text-delta',
            delta: chunk.text,
          };
        }

        const chunkUsage = adapter.extractUsage(chunk.usageMetadata);
        if (chunkUsage) {
          latestUsage = chunkUsage;
        }

        if (chunk.candidates) {
          for (const cand of chunk.candidates) {
            for (const part of cand.content?.parts || []) {
              if (part.functionCall) {
                const fc = part.functionCall;
                yield {
                  type: 'tool-status',
                  toolName: fc.name || 'unknown_tool',
                  status: 'calling',
                  args: (fc.args as Record<string, unknown>) || {},
                  callId: fc.id || `call_${Date.now()}_${fc.name || 'tool'}`,
                  thoughtSignature: (part as Record<string, unknown>).thoughtSignature as string | undefined,
                  message: `Invoking ${fc.name || 'tool'}...`,
                };
              }
            }
          }
        }
      }
      if (latestUsage) {
        yield {
          type: 'usage',
          ...latestUsage,
        };
      }
    };

    const models = this.getModelCascade();
    for (let i = 0; i < models.length; i++) {
      try {
        const stream = await getStream(models[i]);
        yield* consumeStream(this, stream as AsyncIterable<never>);
        return;
      } catch (err: unknown) {
        if (!this.isRecoverableError(err) || i === models.length - 1) {
          throw err;
        }
      }
    }
  }
}
