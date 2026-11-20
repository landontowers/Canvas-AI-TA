import {
  LlmPort,
  LlmCapabilities,
  LlmGenerateOptions,
  LlmResponse,
  LlmUsage,
  StreamEvent,
} from '@ai-tutor/core';

function estimateUsage(options: LlmGenerateOptions, responseText: string): LlmUsage {
  const inputChars =
    options.systemPrompt.length +
    options.messages.reduce((sum, m) => sum + m.content.length, 0);
  const promptTokens = Math.max(1, Math.ceil(inputChars / 4));
  const completionTokens = Math.max(1, Math.ceil(responseText.length / 4));
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export class FakeLlmAdapter implements LlmPort {
  readonly providerName = 'fake';

  constructor(
    private defaultResponseText = 'This is a helpful Socratic guidance response from the fake LLM.',
  ) {}

  getCapabilities(): LlmCapabilities {
    return {
      streaming: true,
      parallelToolCalls: false,
      reasoning: false,
      maxContextTokens: 32000,
      structuredOutput: true,
      supportsPromptCaching: false,
    };
  }

  async generate(options: LlmGenerateOptions): Promise<LlmResponse> {
    const lastUserMessage = [...options.messages].reverse().find((m) => m.role === 'user');
    const content = lastUserMessage?.content || '';

    const hasToolResult = options.messages.some((m) => m.role === 'tool');

    // Simulate tool call if user asks about grades and no tool result has been returned yet
    if (
      !hasToolResult &&
      content.toLowerCase().includes('grade') &&
      options.tools?.some((t: { name: string }) => t.name === 'get_student_grades')
    ) {
      const text = 'Checking your grades...';
      return {
        text,
        toolCalls: [
          {
            id: 'call_fake_grades',
            name: 'get_student_grades',
            args: {},
          },
        ],
        usage: estimateUsage(options, text),
      };
    }

    if (hasToolResult) {
      const text =
        'Based on your grade records, you have an A (95/100) on Week 1 Lab: Safety & Tooling.';
      return {
        text,
        usage: estimateUsage(options, text),
      };
    }

    return {
      text: this.defaultResponseText,
      usage: estimateUsage(options, this.defaultResponseText),
    };
  }

  async *stream(options: LlmGenerateOptions): AsyncIterable<StreamEvent> {
    const response = await this.generate(options);

    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const call of response.toolCalls) {
        yield {
          type: 'tool-status',
          toolName: call.name,
          status: 'calling',
          args: call.args,
          callId: call.id,
          message: `Invoking tool ${call.name}...`,
        };
      }
    }

    const words = response.text.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield {
        type: 'text-delta',
        delta: (i > 0 ? ' ' : '') + words[i],
      };
    }

    if (response.usage) {
      yield {
        type: 'usage',
        ...response.usage,
      };
    }

    yield {
      type: 'done',
      conversationId: 'fake-conv-id',
      messageId: 'fake-msg-id',
    };
  }
}
