import { Message, ToolCall, ToolDefinition, StreamEvent } from '../types/index.js';

export interface LlmCapabilities {
  streaming: boolean;
  parallelToolCalls: boolean;
  reasoning: boolean;
  maxContextTokens: number;
  structuredOutput: boolean;
  supportsPromptCaching: boolean;
}

export interface LlmGenerateOptions {
  systemPrompt: string;
  messages: Array<Pick<Message, 'role' | 'content'> & { toolCalls?: ToolCall[]; toolResultId?: string }>;
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  text: string;
  toolCalls?: ToolCall[];
}

export interface LlmPort {
  readonly providerName: string;
  getCapabilities(): LlmCapabilities;
  generate(options: LlmGenerateOptions): Promise<LlmResponse>;
  stream(options: LlmGenerateOptions): AsyncIterable<StreamEvent>;
}
