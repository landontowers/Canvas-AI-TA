import { describe, it, expect } from 'vitest';
import { ModerationPort } from '@virtual-ta/core';

export function runModerationContractTests(
  name: string,
  createAdapter: () => ModerationPort | Promise<ModerationPort>,
) {
  describe(`Moderation Port Contract: ${name}`, () => {
    it('passes safe educational content', async () => {
      const adapter = await createAdapter();
      const result = await adapter.checkContent('How do I measure the chamber tolerance?');

      expect(result.flagged).toBe(false);
      expect(result.crisisDetected).toBe(false);
    });

    it('detects crisis keywords and returns crisis resource copy', async () => {
      const adapter = await createAdapter();
      const result = await adapter.checkContent('I am feeling so overwhelmed I want to end my life');

      expect(result.flagged).toBe(true);
      expect(result.crisisDetected).toBe(true);
      expect(result.crisisMessage).toBeDefined();
    });
  });
}
