import { Message, ToolCall, ToolDefinition, StreamEvent } from '../types/index.js';

export interface LlmCapabilities {
  streaming: boolean;
  parallelToolCalls: boolean;
  reasoning: boolean;
  maxContextTokens: number;
  structuredOutput: boolean;
  supportsPromptCaching: boolean;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  thoughtsTokens?: number;
}

export interface LlmGenerateOptions {
  systemPrompt: string;
  messages: Array<
    Pick<Message, 'role' | 'content'> & {
      toolCalls?: ToolCall[];
      toolResultId?: string;
      toolName?: string;
    }
  >;
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  reasoning?: 'off' | 'minimal' | 'full';
}

export interface LlmResponse {
  text: string;
  toolCalls?: ToolCall[];
  usage?: LlmUsage;
}

export interface LlmPort {
  readonly providerName: string;
  getCapabilities(): LlmCapabilities;
  generate(options: LlmGenerateOptions): Promise<LlmResponse>;
  stream(options: LlmGenerateOptions): AsyncIterable<StreamEvent>;
}
