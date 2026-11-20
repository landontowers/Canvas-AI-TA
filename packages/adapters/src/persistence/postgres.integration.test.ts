import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runMigrations } from './migrate.js';
import { seedDatabase } from './seed.js';
import { createDrizzlePersistence } from './drizzle-persistence.adapter.js';
import { runPersistenceContractTests } from '../contracts/persistence.contract.js';

const testPostgresUrl = process.env.TEST_POSTGRES_URL;

describe.skipIf(!testPostgresUrl)('DrizzlePersistenceAdapter (Live PostgreSQL Integration)', () => {
  let pgConn: ReturnType<typeof createDrizzlePersistence>;

  beforeAll(async () => {
    await runMigrations(testPostgresUrl!);
    await seedDatabase(testPostgresUrl!);
    pgConn = createDrizzlePersistence(testPostgresUrl!);
    await pgConn.adapter.upsertCollege({
      id: 'sdi-test',
      name: 'SDI Test College',
      domain: 'test.sdi.edu',
      createdAt: new Date(),
    });
    await pgConn.adapter.upsertCourse({
      id: 'course-abc',
      collegeId: 'sdi-test',
      externalCanvasId: 'canvas-abc',
      name: 'Course ABC',
      courseCode: 'ABC-101',
    });
    await pgConn.adapter.updateCourseSettings('course-abc', 'full');
  });

  afterAll(async () => {
    if (pgConn) {
      await pgConn.adapter.updateCourseSettings('course-abc', 'full');
      await pgConn.close();
    }
  });

  runPersistenceContractTests('DrizzlePersistenceAdapter', async () => {
    await pgConn.adapter.upsertCollege({
      id: 'sdi-test',
      name: 'SDI Test College',
      domain: 'test.sdi.edu',
      createdAt: new Date(),
    });
    await pgConn.adapter.upsertCourse({
      id: 'course-abc',
      collegeId: 'sdi-test',
      externalCanvasId: 'canvas-abc',
      name: 'Course ABC',
      courseCode: 'ABC-101',
    });
    return pgConn.adapter;
  });

  it('upserts repeated course setting changes on courseId and clears user-1001 without UUID failure', async () => {
    await pgConn.adapter.updateCourseSettings('sdi-ftt101', 'logistics_only');
    const updated = await pgConn.adapter.updateCourseSettings('sdi-ftt101', 'full');
    expect(updated.setting).toBe('full');

    const conv = await pgConn.adapter.createConversation({
      collegeId: 'sdi',
      courseId: 'sdi-ftt101',
      userId: 'user-1001',
      role: 'student',
    });
    const saved = await pgConn.adapter.saveMessage({
      conversationId: conv.id,
      role: 'user',
      content: 'First user prompt for live postgres',
      isCrisis: true,
    });
    expect(saved.isCrisis).toBe(true);

    const fetchedConv = await pgConn.adapter.getConversation(conv.id);
    expect(fetchedConv?.title).toBe('First user prompt for live postgres');
    expect(fetchedConv?.messageCount).toBe(1);

    const hintUpdated = await pgConn.adapter.updateConversationScaffoldingState(conv.id, {
      activeConcept: 'barrel harmonics',
      attemptCount: 3,
      hintLevel: 3,
    });
    expect(hintUpdated?.scaffoldingState?.hintLevel).toBe(3);

    const reloadedConv = await pgConn.adapter.getConversation(conv.id);
    expect(reloadedConv?.scaffoldingState?.activeConcept).toBe('barrel harmonics');
    expect(reloadedConv?.scaffoldingState?.attemptCount).toBe(3);

    await pgConn.adapter.clearUserData('user-1001');
    const afterClear = await pgConn.adapter.listConversations('user-1001', 'sdi-ftt101');
    expect(afterClear).toHaveLength(0);
  });

  it('purges aged conversations beyond configured retentionDays in Postgres', async () => {
    const conv = await pgConn.adapter.createConversation({
      collegeId: 'sdi',
      courseId: 'sdi-ftt101',
      userId: 'user-aged-retention',
      role: 'student',
    });
    await pgConn.adapter.saveMessage({
      conversationId: conv.id,
      role: 'user',
      content: 'Old question from 120 days ago',
    });

    // Advance clock 120 days forward in purge check while verifying active rows survive normal purge
    const futureCutoff = new Date(Date.now() + 120 * 86_400_000);
    const purged = await pgConn.adapter.purgeExpiredConversations(90, futureCutoff);
    expect(purged.deletedConversations).toBeGreaterThanOrEqual(1);
    expect(purged.deletedMessages).toBeGreaterThanOrEqual(1);
    expect(await pgConn.adapter.getConversation(conv.id)).toBeNull();
  });

  it('auto-registers unseeded live Canvas course IDs on createConversation and getCourseSettings', async () => {
    const unseededCourseId = `canvas-live-${Date.now()}`;
    const settings = await pgConn.adapter.getCourseSettings(unseededCourseId);
    expect(settings.courseId).toBe(unseededCourseId);
    expect(settings.setting).toBe('full');

    const conv = await pgConn.adapter.createConversation({
      collegeId: 'sdi',
      courseId: unseededCourseId,
      userId: 'user-1001',
      role: 'student',
    });
    expect(conv.courseId).toBe(unseededCourseId);

    await pgConn.adapter.clearUserData('user-1001');
  });
});
