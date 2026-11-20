import { describe, it, expect } from 'vitest';
import { PersistencePort } from '@virtual-ta/core';

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

      const updatedConv = await adapter.updateConversationScaffoldingState(conv.id, {
        activeConcept: 'headspace tolerance',
        attemptCount: 2,
        hintLevel: 2,
        lastUpdatedAt: '2026-11-20T12:00:00.000Z',
      });
      expect(updatedConv?.scaffoldingState?.hintLevel).toBe(2);

      const reloadedConv = await adapter.getConversation(conv.id);
      expect(reloadedConv?.scaffoldingState).toEqual({
        activeConcept: 'headspace tolerance',
        attemptCount: 2,
        hintLevel: 2,
        lastUpdatedAt: '2026-11-20T12:00:00.000Z',
      });
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

    it('records and lists crisis incidents independently from conversations (FERPA §99.36)', async () => {
      const adapter = await createAdapter();
      const incident = await adapter.saveCrisisIncident({
        collegeId: 'sdi-test',
        courseId: 'course-abc',
        studentId: 'student-999',
        category: 'self_harm',
        triggerSnippet: 'suicide',
        responseRendered: 'Emergency support resources provided.',
      });

      expect(incident.id).toBeDefined();
      expect(incident.studentId).toBe('student-999');
      expect(incident.triggerSnippet).toBe('suicide');

      const incidents = await adapter.listCrisisIncidents('sdi-test');
      expect(incidents.length).toBeGreaterThan(0);
      expect(incidents.some((i) => i.id === incident.id)).toBe(true);
    });

    it('preserves active conversations when purging outside retention window', async () => {
      const adapter = await createAdapter();
      const conv = await adapter.createConversation({
        collegeId: 'sdi-test',
        courseId: 'course-abc',
        userId: 'user-retention-active',
        role: 'student',
      });
      await adapter.saveMessage({
        conversationId: conv.id,
        role: 'user',
        content: 'Recent conversation should remain',
      });

      const result = await adapter.purgeExpiredConversations(365, new Date());
      expect(result.deletedConversations).toBe(0);
      expect(result.deletedMessages).toBe(0);

      const reloaded = await adapter.getConversation(conv.id);
      expect(reloaded?.id).toBe(conv.id);

      await adapter.clearUserData('user-retention-active');
    });

    it('supports blackout windows, single-conversation delete, k-anonymous confusion pulse, and crisis status workflow', async () => {
      const adapter = await createAdapter();

      const start = new Date('2026-11-25T10:00:00Z');
      const end = new Date('2026-11-25T12:00:00Z');
      const withBlackout = await adapter.updateCourseSettings('course-abc', 'off', {
        blackoutStart: start,
        blackoutEnd: end,
      });
      expect(withBlackout.setting).toBe('off');
      expect(withBlackout.blackoutStart?.toISOString()).toBe(start.toISOString());
      expect(withBlackout.blackoutEnd?.toISOString()).toBe(end.toISOString());

      const cleared = await adapter.updateCourseSettings('course-abc', 'full', {
        blackoutStart: null,
        blackoutEnd: null,
      });
      expect(cleared.setting).toBe('full');
      expect(cleared.blackoutStart).toBeUndefined();

      // Single-conversation delete enforces ownership
      const conv = await adapter.createConversation({
        collegeId: 'sdi-test',
        courseId: 'course-abc',
        userId: 'delete-owner',
        role: 'student',
      });
      expect(await adapter.deleteConversation(conv.id, 'other-user')).toBe(false);
      expect(await adapter.deleteConversation(conv.id, 'delete-owner')).toBe(true);
      expect(await adapter.getConversation(conv.id)).toBeNull();

      // Confusion pulse enforces k-anonymity >= 5 distinct students
      for (let i = 1; i <= 4; i++) {
        const c = await adapter.createConversation({
          collegeId: 'sdi-test',
          courseId: 'pulse-course',
          userId: `pulse-u-${i}`,
          role: 'student',
        });
        await adapter.updateConversationScaffoldingState(c.id, {
          activeConcept: 'headspace tolerance',
          attemptCount: 1,
          hintLevel: 1,
        });
      }
      const below = await adapter.getConfusionPulse('pulse-course', 5);
      expect(below.thresholdMet).toBe(false);
      expect(below.topics).toEqual([]);

      const c5 = await adapter.createConversation({
        collegeId: 'sdi-test',
        courseId: 'pulse-course',
        userId: 'pulse-u-5',
        role: 'student',
      });
      await adapter.updateConversationScaffoldingState(c5.id, {
        activeConcept: 'headspace tolerance',
        attemptCount: 1,
        hintLevel: 1,
      });
      const above = await adapter.getConfusionPulse('pulse-course', 5);
      expect(above.thresholdMet).toBe(true);
      expect(above.distinctStudents).toBeGreaterThanOrEqual(5);
      expect(above.topics[0].topic).toBe('headspace tolerance');

      for (let i = 1; i <= 5; i++) {
        await adapter.clearUserData(`pulse-u-${i}`);
      }

      // Crisis incident status transitions
      const inc = await adapter.saveCrisisIncident({
        collegeId: 'sdi-test',
        courseId: 'course-abc',
        studentId: 'student-triage',
        category: 'self_harm',
        triggerSnippet: 'crisis snippet',
        responseRendered: '988',
      });
      const ack = await adapter.updateCrisisIncidentStatus(inc.id, 'acknowledged', 'inst-1');
      expect(ack?.status).toBe('acknowledged');
      expect(ack?.reviewedBy).toBe('inst-1');
      const res = await adapter.updateCrisisIncidentStatus(inc.id, 'resolved', 'inst-1');
      expect(res?.status).toBe('resolved');
    });
  });
}
