import { ModerationPort, ModerationResult } from '@virtual-ta/core';

export class FakeModerationAdapter implements ModerationPort {
  private crisisKeywords = [
    'suicide',
    'kill myself',
    'self-harm',
    'end my life',
    'want to die',
    'cutting myself',
    'harm others',
  ];

  constructor(
    private crisisMessage = 'If you are experiencing a mental health emergency, please dial 988 or reach out to SDI Student Support.',
  ) {}

  async checkContent(content: string, _userId?: string): Promise<ModerationResult> {
    const lower = content.toLowerCase();
    const matched = this.crisisKeywords.find((kw) => lower.includes(kw));

    if (matched) {
      return {
        flagged: true,
        categories: ['self-harm'],
        crisisDetected: true,
        crisisMessage: this.crisisMessage,
        reason: 'Self-harm or crisis signals detected',
        triggerSnippet: matched,
      };
    }

    return {
      flagged: false,
      categories: [],
      crisisDetected: false,
    };
  }
}
