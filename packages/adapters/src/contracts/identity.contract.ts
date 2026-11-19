import { describe, it, expect } from 'vitest';
import { IdentityPort } from '@ai-tutor/core';

export function runIdentityContractTests(
  name: string,
  createAdapter: () => IdentityPort | Promise<IdentityPort>,
) {
  describe(`Identity Port Contract: ${name}`, () => {
    it('resolves demo student to student tutor role', async () => {
      const adapter = await createAdapter();
      const context = await adapter.resolveIdentity({ personaId: 'demo_student' });

      expect(context.tutorRole).toBe('student');
      expect(context.collegeId).toBe('sdi');
    });

    it('resolves demo instructor to instructor tutor role', async () => {
      const adapter = await createAdapter();
      const context = await adapter.resolveIdentity({ personaId: 'demo_instructor' });

      expect(context.tutorRole).toBe('instructor');
      expect(context.collegeId).toBe('sdi');
    });

    it('resolves TA with mixed roles to instructor tutor role', async () => {
      const adapter = await createAdapter();
      const context = await adapter.resolveIdentity({ personaId: 'demo_ta' });

      expect(context.tutorRole).toBe('instructor');
    });

    it('rejects unknown persona not in allowlist', async () => {
      const adapter = await createAdapter();
      await expect(
        adapter.resolveIdentity({ personaId: 'unauthorized_hacker' }),
      ).rejects.toThrow(/Unauthorized|allowlist/i);
    });
  });
}
