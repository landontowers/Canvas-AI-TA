import { describe, it, expect } from 'vitest';
import { IdentityPort } from '@virtual-ta/core';

export function runIdentityContractTests(
  name: string,
  createAdapter: () => IdentityPort | Promise<IdentityPort>,
) {
  describe(`Identity Port Contract: ${name}`, () => {
    it('resolves demo student to student Virtual TA role', async () => {
      const adapter = await createAdapter();
      const context = await adapter.resolveIdentity({ personaId: 'demo_student' });

      expect(context.assistantRole).toBe('student');
      expect(context.collegeId).toBe('sdi');
    });

    it('resolves demo instructor to instructor Virtual TA role', async () => {
      const adapter = await createAdapter();
      const context = await adapter.resolveIdentity({ personaId: 'demo_instructor' });

      expect(context.assistantRole).toBe('instructor');
      expect(context.collegeId).toBe('sdi');
    });

    it('resolves TA with mixed roles to instructor Virtual TA role', async () => {
      const adapter = await createAdapter();
      const context = await adapter.resolveIdentity({ personaId: 'demo_ta' });

      expect(context.assistantRole).toBe('instructor');
    });

    it('rejects unknown persona not in allowlist', async () => {
      const adapter = await createAdapter();
      await expect(
        adapter.resolveIdentity({ personaId: 'unauthorized_hacker' }),
      ).rejects.toThrow(/Unauthorized|allowlist/i);
    });
  });
}
