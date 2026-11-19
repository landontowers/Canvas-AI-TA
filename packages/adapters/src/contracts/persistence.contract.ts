import { describe, it, expect } from 'vitest';
import { PersistencePort } from '@ai-tutor/core';

export function runPersistenceContractTests(
  name: string,
  createAdapter: () => PersistencePort | Promise<PersistencePort>,
) {
  describe(`Persistence Port Contract: ${name}`, () => {
    it('handles college records', async () => {
      const adapter = await createAdapter();
      const college = await adapter.upsertCollege({
        id: 'sdi-test',
        name: 'SDI Test College',
        domain: 'test.sdi.edu',
        createdAt: new Date(),
      });

      const fetched = await adapter.getCollege(college.id);
      expect(fetched?.name).toBe('SDI Test College');
    });

    it('manages course settings (full vs logistics_only)', async () => {
      const adapter = await createAdapter();
      const initial = await adapter.getCourseSettings('course-abc');
      expect(initial.setting).toBe('full');

      const updated = await adapter.updateCourseSettings('course-abc', 'logistics_only');
      expect(updated.setting).toBe('logistics_only');

      const refetched = await adapter.getCourseSettings('course-abc');
      expect(refetched.setting).toBe('logistics_only');
    });

    it('manages conversations and message history', async () => {
      const adapter = await createAdapter();
      const conv = await adapter.createConversation({
        collegeId: 'sdi-test',
        courseId: 'course-abc',
        userId: 'user-123',
        role: 'student',
      });

      expect(conv.id).toBeDefined();

      const msg1 = await adapter.saveMessage({
        conversationId: conv.id,
        role: 'user',
        content: 'When is the next lab due?',
      });

      const msg2 = await adapter.saveMessage({
        conversationId: conv.id,
        role: 'assistant',
        content: 'Your next lab is due Thursday at 11:59 PM.',
      });

      const history = await adapter.listMessages(conv.id);
      expect(history.length).toBe(2);
      expect(history[0].id).toBe(msg1.id);
      expect(history[1].id).toBe(msg2.id);
    });

    it('clears student data on opt-out', async () => {
      const adapter = await createAdapter();
      const conv = await adapter.createConversation({
        collegeId: 'sdi-test',
        courseId: 'course-abc',
        userId: 'user-to-delete',
        role: 'student',
      });

      await adapter.saveMessage({
        conversationId: conv.id,
        role: 'user',
        content: 'Private message',
      });

      await adapter.clearUserData('user-to-delete');

      const convs = await adapter.listConversations('user-to-delete', 'course-abc');
      expect(convs.length).toBe(0);

      const msgs = await adapter.listMessages(conv.id);
      expect(msgs.length).toBe(0);
    });
  });
}
