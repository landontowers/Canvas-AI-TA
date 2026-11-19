import { ModerationPort, ModerationResult } from '@ai-tutor/core';

export class FakeModerationAdapter implements ModerationPort {
  private crisisKeywords = ['suicide', 'kill myself', 'self-harm', 'end my life'];

  constructor(
    private crisisMessage = 'If you are experiencing a mental health emergency, please dial 988 or reach out to SDI Student Support.',
  ) {}

  async checkContent(content: string, _userId?: string): Promise<ModerationResult> {
    const lower = content.toLowerCase();
    const hasCrisis = this.crisisKeywords.some((kw) => lower.includes(kw));

    if (hasCrisis) {
      return {
        flagged: true,
        categories: ['self-harm'],
        crisisDetected: true,
        crisisMessage: this.crisisMessage,
        reason: 'Self-harm signals detected',
      };
    }

    return {
      flagged: false,
      categories: [],
      crisisDetected: false,
    };
  }
}
