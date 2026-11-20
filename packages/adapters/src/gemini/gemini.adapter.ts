import {
  LlmPort,
  LlmCapabilities,
  LlmGenerateOptions,
  LlmResponse,
  StreamEvent,
  ToolCall,
} from '@ai-tutor/core';
import { GoogleGenAI, Type } from '@google/genai';

export interface GeminiAdapterOptions {
  apiKey?: string;
  defaultModel?: string;
}

export class GeminiAdapter implements LlmPort {
  readonly providerName = 'gemini';
  private client?: GoogleGenAI;
  private defaultModel: string;

  constructor(options: GeminiAdapterOptions = {}) {
    const key = options.apiKey || process.env.GEMINI_API_KEY;
    if (key) {
      this.client = new GoogleGenAI({ apiKey: key });
    }
    this.defaultModel = options.defaultModel || 'gemini-3.8-flash';
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
                name: m.toolResultId || 'tool_response',
                response: { output: m.content },
              },
            },
          ],
        };
      }

      return {
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: m.content }],
      };
    });
  }

  private mapToolsToGemini(options: LlmGenerateOptions) {
    if (!options.tools || options.tools.length === 0) return undefined;

    const functionDeclarations = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    }));

    return [{ functionDeclarations }];
  }

  async generate(options: LlmGenerateOptions): Promise<LlmResponse> {
    if (!this.client) {
      throw new Error(
        'Gemini API key is not configured. Set GEMINI_API_KEY in .env or provide it to GeminiAdapter.',
      );
    }

    const contents = this.mapMessagesToContents(options);
    const tools = this.mapToolsToGemini(options);

    const response = await this.client.models.generateContent({
      model: this.defaultModel,
      contents,
      config: {
        systemInstruction: options.systemPrompt,
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
        ...(tools ? { tools } : {}),
      },
    });

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

    const streamResponse = await this.client.models.generateContentStream({
      model: this.defaultModel,
      contents,
      config: {
        systemInstruction: options.systemPrompt,
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
        ...(tools ? { tools } : {}),
      },
    });

    for await (const chunk of streamResponse) {
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
            message: `Invoking ${fc.name || 'tool'}...`,
          };
        }
      }
    }
  }
}
