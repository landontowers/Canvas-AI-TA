import {
  LlmPort,
  LlmCapabilities,
  LlmGenerateOptions,
  LlmResponse,
  StreamEvent,
  ToolCall,
} from '@ai-tutor/core';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface GeminiAdapterOptions {
  apiKey?: string;
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
    const key = options.apiKey || process.env.GEMINI_API_KEY;
    if (key) {
      this.client = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          timeout: options.timeout ?? 15000,
        },
      });
    }
    this.defaultModel = options.defaultModel || 'gemini-3.8-flash';
    this.fallbackModel = options.fallbackModel || 'gemini-3.5-flash-lite';
  }

  getCapabilities(): LlmCapabilities {
    return {
      streaming: true,
      parallelToolCalls: true,
      reasoning: false,
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
            parts.push({
              functionCall: {
                id: tc.id,
                name: tc.name,
                args: tc.args || {},
              },
            });
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

  private mapToolsToGemini(options: LlmGenerateOptions) {
    if (!options.tools || options.tools.length === 0) return undefined;

    const functionDeclarations = options.tools.map((t) => {
      const jsonSchema = zodToJsonSchema(t.parameters, { target: 'openApi3' });
      // Remove $schema for clean Gemini compatibility
      const { $schema: _schema, ...cleanSchema } = jsonSchema as Record<string, unknown>;

      return {
        name: t.name,
        description: t.description,
        parametersJsonSchema: cleanSchema,
      };
    });

    return [{ functionDeclarations }];
  }

  private getThinkingConfig(model: string) {
    if (model.includes('3.8')) {
      return { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
    }
    if (model.includes('3.5') || model.includes('3.6')) {
      return { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } };
    }
    return {};
  }

  private isRecoverableError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
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
      msg.includes('overloaded')
    );
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
      const thinking = this.getThinkingConfig(model);
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

    let response;
    try {
      response = await callModel(this.defaultModel);
    } catch (err: unknown) {
      if (this.isRecoverableError(err) && this.fallbackModel && this.fallbackModel !== this.defaultModel) {
        response = await callModel(this.fallbackModel);
      } else {
        throw err;
      }
    }

    const text = response.text || '';
    const toolCalls: ToolCall[] = [];

    const functionCalls = response.functionCalls;
    if (functionCalls) {
      for (const fc of functionCalls) {
        toolCalls.push({
          id: `call_${Date.now()}_${fc.name || 'tool'}`,
          name: fc.name || 'unknown_tool',
          args: (fc.args as Record<string, unknown>) || {},
        });
      }
    }

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
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
      const thinking = this.getThinkingConfig(model);
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

    let activeStream;
    let modelUsed = this.defaultModel;

    try {
      activeStream = await getStream(this.defaultModel);
    } catch (err: unknown) {
      if (this.isRecoverableError(err) && this.fallbackModel && this.fallbackModel !== this.defaultModel) {
        modelUsed = this.fallbackModel;
        activeStream = await getStream(this.fallbackModel);
      } else {
        throw err;
      }
    }

    try {
      for await (const chunk of activeStream) {
        if (chunk.text) {
          yield {
            type: 'text-delta',
            delta: chunk.text,
          };
        }

        if (chunk.functionCalls) {
          for (const fc of chunk.functionCalls) {
            yield {
              type: 'tool-status',
              toolName: fc.name || 'unknown_tool',
              status: 'calling',
              args: (fc.args as Record<string, unknown>) || {},
              callId: fc.id || `call_${Date.now()}_${fc.name || 'tool'}`,
              message: `Invoking ${fc.name || 'tool'}...`,
            };
          }
        }
      }
    } catch (streamErr: unknown) {
      if (this.isRecoverableError(streamErr) && modelUsed === this.defaultModel && this.fallbackModel && this.fallbackModel !== this.defaultModel) {
        const fallbackStream = await getStream(this.fallbackModel);
        for await (const chunk of fallbackStream) {
          if (chunk.text) {
            yield {
              type: 'text-delta',
              delta: chunk.text,
            };
          }

          if (chunk.functionCalls) {
            for (const fc of chunk.functionCalls) {
              yield {
                type: 'tool-status',
                toolName: fc.name || 'unknown_tool',
                status: 'calling',
                args: (fc.args as Record<string, unknown>) || {},
                callId: fc.id || `call_${Date.now()}_${fc.name || 'tool'}`,
                message: `Invoking ${fc.name || 'tool'}...`,
              };
            }
          }
        }
      } else {
        throw streamErr;
      }
    }
  }
}
