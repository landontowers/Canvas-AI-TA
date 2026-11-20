import { describe, it, expect, vi } from 'vitest';
import { DrizzlePersistenceAdapter } from './drizzle-persistence.adapter.js';
import * as schema from './schema.js';
import { MIGRATION_STATEMENTS, runMigrations } from './migrate.js';

describe('DrizzlePersistenceAdapter Unit Tests', () => {
  it('manages colleges (get and upsert)', async () => {
    const mockDb: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: 'sdi',
          name: 'Sonoran Desert Institute',
          domain: 'sdi.edu',
          ltiIssuer: 'https://canvas.instructure.com',
          createdAt: new Date('2026-01-01'),
        },
      ]),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue({}),
        }),
      }),
    };

    const adapter = new DrizzlePersistenceAdapter(mockDb);
    const college = await adapter.getCollege('sdi');

    expect(college).toBeDefined();
    expect(college?.id).toBe('sdi');
    expect(college?.name).toBe('Sonoran Desert Institute');

    // Test upsert
    const upserted = await adapter.upsertCollege({
      id: 'sdi-2',
      name: 'SDI Campus 2',
      domain: 'sdi2.edu',
      createdAt: new Date(),
    });
    expect(upserted.id).toBe('sdi-2');
  });

  it('manages users (getUser, getUserByExternalCanvasId, upsertUser)', async () => {
    let returnExisting = false;
    const mockDb: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        if (!returnExisting) return Promise.resolve([]);
        return Promise.resolve([
          {
            id: 'usr_1',
            collegeId: 'sdi',
            externalCanvasId: 'canvas_101',
            name: 'Alex Chen',
            email: 'alex@sdi.edu',
            role: 'student',
            createdAt: new Date(),
          },
        ]);
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'usr_new',
              collegeId: 'sdi',
              externalCanvasId: 'canvas_202',
              name: 'Elena',
              email: 'elena@sdi.edu',
              role: 'instructor',
              createdAt: new Date(),
            },
          ]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
    };

    const adapter = new DrizzlePersistenceAdapter(mockDb);

    // Initial query returns null
    const user1 = await adapter.getUser('usr_1');
    expect(user1).toBeNull();

    // Query by external ID
    returnExisting = true;
    const user2 = await adapter.getUserByExternalCanvasId('sdi', 'canvas_101');
    expect(user2).toBeDefined();
    expect(user2?.name).toBe('Alex Chen');

    // Upsert existing user (triggers update)
    const updated = await adapter.upsertUser({
      id: 'usr_1',
      collegeId: 'sdi',
      externalCanvasId: 'canvas_101',
      name: 'Alex Chen Updated',
      role: 'student',
    });
    expect(updated.name).toBe('Alex Chen Updated');

    // Upsert brand new user (triggers insert)
    returnExisting = false;
    const inserted = await adapter.upsertUser({
      collegeId: 'sdi',
      externalCanvasId: 'canvas_202',
      name: 'Elena',
      role: 'instructor',
    });
    expect(inserted.id).toBe('usr_new');
  });

  it('manages courses and course settings', async () => {
    const onConflictSpy = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 'cs_1',
          courseId: 'c1',
          setting: 'logistics_only',
          updatedAt: new Date(),
        },
      ]),
    });

    const mockDb: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() =>
        Promise.resolve([
          {
            id: 'c1',
            collegeId: 'sdi',
            name: 'FTT 101',
            courseCode: 'FTT101',
            setting: 'full',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      ),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: onConflictSpy,
        }),
      }),
    };

    const adapter = new DrizzlePersistenceAdapter(mockDb);

    const course = await adapter.getCourse('c1');
    expect(course?.name).toBe('FTT 101');

    const courseSettings = await adapter.getCourseSettings('c1');
    expect(courseSettings.setting).toBe('full');

    const saved = await adapter.updateCourseSettings('c1', 'logistics_only');
    expect(saved.setting).toBe('logistics_only');
    expect(onConflictSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        target: schema.courseSettingsTable.courseId,
      }),
    );

    const upserted = await adapter.upsertCourse({
      id: 'c2',
      collegeId: 'sdi',
      externalCanvasId: 'canvas_c2',
      name: 'FTT 102',
      courseCode: 'FTT102',
      createdAt: new Date(),
    });
    expect(upserted.id).toBe('c2');
  });

  it('manages conversations, messages, and deletion', async () => {
    const insertedValuesSpy = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 'msg_1',
          conversationId: 'conv_1',
          role: 'user',
          content: 'Help with lab 1',
          citations: [],
          isCrisis: true,
          createdAt: new Date(),
        },
      ]),
      onConflictDoUpdate: vi.fn().mockResolvedValue({}),
    });

    const mockDb: any = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() =>
        Promise.resolve([
          {
            id: 'conv_1',
            collegeId: 'sdi',
            courseId: 'c1',
            userId: 'user-1001',
            role: 'student',
            title: 'Help with lab 1',
            messageCount: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      ),
      insert: vi.fn().mockReturnValue({
        values: insertedValuesSpy,
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 'conv_1' }]),
      }),
      then: (resolve: (v: any) => void) => resolve([{ id: 'conv_1' }]),
    };

    const adapter = new DrizzlePersistenceAdapter(mockDb);

    const conv = await adapter.getConversation('conv_1');
    expect(conv?.id).toBe('conv_1');
    expect(conv?.title).toBe('Help with lab 1');
    expect(conv?.messageCount).toBe(1);

    const msg = await adapter.saveMessage({
      conversationId: 'conv_1',
      role: 'user',
      content: 'Help with lab 1',
      isCrisis: true,
    });
    expect(msg.id).toBe('msg_1');
    expect(msg.isCrisis).toBe(true);
    expect(insertedValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isCrisis: true }),
    );

    // Non-UUID Canvas-derived IDs (like 'user-1001') and valid UUIDs both execute cleanly
    await adapter.clearUserData('user-1001');
    await adapter.clearUserData('11111111-1111-4111-8111-111111111111');
    expect(mockDb.delete).toHaveBeenCalled();

    await adapter.resetDemo('sdi-ftt101');
    expect(mockDb.delete).toHaveBeenCalled();
  });

  it('executes idempotent DDL migration statements via runMigrations', async () => {
    const executedSql: string[] = [];
    await runMigrations('postgresql://postgres:postgrespassword@localhost:5432/virtual_ta', {
      unsafe: async (stmt: string) => {
        executedSql.push(stmt);
      },
    });

    expect(executedSql).toEqual(MIGRATION_STATEMENTS);
    expect(executedSql.some((s) => s.includes('course_id TEXT NOT NULL UNIQUE'))).toBe(true);
    expect(executedSql.some((s) => s.includes('is_crisis BOOLEAN'))).toBe(true);
    expect(executedSql.some((s) => s.includes('scaffolding_state JSONB'))).toBe(true);
  });

  it('updates conversation scaffolding state', async () => {
    const returningSpy = vi.fn().mockResolvedValue([
      {
        id: 'conv_1',
        collegeId: 'sdi',
        courseId: 'c1',
        userId: 'user-1001',
        role: 'student',
        title: 'Help with lab 1',
        messageCount: 2,
        scaffoldingState: {
          activeConcept: 'headspace tolerance',
          attemptCount: 2,
          hintLevel: 2,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const mockDb: any = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: returningSpy,
          }),
        }),
      }),
    };

    const adapter = new DrizzlePersistenceAdapter(mockDb);
    const updated = await adapter.updateConversationScaffoldingState('conv_1', {
      activeConcept: 'headspace tolerance',
      attemptCount: 2,
      hintLevel: 2,
    });
    expect(updated?.scaffoldingState?.hintLevel).toBe(2);
  });

  it('records and lists crisis incidents', async () => {
    const mockDb: any = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'inc_1',
              collegeId: 'sdi',
              courseId: 'c1',
              studentId: 'u1',
              category: 'self-harm',
              triggerSnippet: 'distress snippet',
              responseRendered: 'Call 988',
              reviewed: false,
              createdAt: new Date(),
            },
          ]),
        }),
      }),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        {
          id: 'inc_1',
          collegeId: 'sdi',
          courseId: 'c1',
          studentId: 'u1',
          category: 'self-harm',
          triggerSnippet: 'distress snippet',
          responseRendered: 'Call 988',
          reviewed: false,
          createdAt: new Date(),
        },
      ]),
    };

    const adapter = new DrizzlePersistenceAdapter(mockDb);

    const saved = await adapter.saveCrisisIncident({
      collegeId: 'sdi',
      courseId: 'c1',
      studentId: 'u1',
      category: 'self-harm',
      triggerSnippet: 'distress snippet',
      responseRendered: 'Call 988',
    });
    expect(saved.id).toBe('inc_1');

    const incidents = await adapter.listCrisisIncidents('sdi');
    expect(incidents).toHaveLength(1);
    expect(incidents[0].category).toBe('self-harm');
  });
});
