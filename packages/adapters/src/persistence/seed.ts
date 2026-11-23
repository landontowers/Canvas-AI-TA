import postgres from 'postgres';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { like, inArray, or } from 'drizzle-orm';
import * as schema from './schema.js';
import { SDI_COLLEGE_CONFIG } from '../config/sdi.config.js';

export async function seedDatabaseWithDb(db: PostgresJsDatabase<typeof schema>) {
  // 1. Seed SDI college
  await db
    .insert(schema.collegesTable)
    .values({
      id: SDI_COLLEGE_CONFIG.id,
      name: SDI_COLLEGE_CONFIG.name,
      domain: SDI_COLLEGE_CONFIG.domain,
    })
    .onConflictDoNothing();

  // 2. Seed sandbox & cross-course catalog
  await db
    .insert(schema.coursesTable)
    .values([
      {
        id: 'sdi-ftt101',
        collegeId: SDI_COLLEGE_CONFIG.id,
        externalCanvasId: 'course_101',
        name: 'FTT-101: Firearms Safety & Fundamentals',
        courseCode: 'FTT-101',
      },
      {
        id: 'sdi-ftt104',
        collegeId: SDI_COLLEGE_CONFIG.id,
        externalCanvasId: 'course_104',
        name: 'FTT-104: Modern Sporting Rifles',
        courseCode: 'FTT-104',
      },
      {
        id: 'sdi-fbs201',
        collegeId: SDI_COLLEGE_CONFIG.id,
        externalCanvasId: 'course_201',
        name: 'FBS-201: Firearms Basic Ballistics',
        courseCode: 'FBS-201',
      },
      {
        id: 'sdi-gun105',
        collegeId: SDI_COLLEGE_CONFIG.id,
        externalCanvasId: 'course_105',
        name: 'GUN-105: Gunsmithing Bench Safety',
        courseCode: 'GUN-105',
      },
    ])
    .onConflictDoNothing();

  // 3. Seed default course settings ('full')
  await db
    .insert(schema.courseSettingsTable)
    .values([
      { courseId: 'sdi-ftt101', setting: 'full' },
      { courseId: 'sdi-ftt104', setting: 'full' },
      { courseId: 'sdi-fbs201', setting: 'full' },
      { courseId: 'sdi-gun105', setting: 'full' },
    ])
    .onConflictDoNothing();
}

export async function seedDatabase(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql, { schema });

  try {
    await seedDatabaseWithDb(db);
    console.log('Database seeded successfully with SDI college and FTT-101 sandbox course.');
  } finally {
    await sql.end();
  }
}

/**
 * Populates rich, idempotent synthetic demo data using an existing Drizzle DB handle.
 */
export async function seedDemoDataWithDb(db: PostgresJsDatabase<typeof schema>) {
  await seedDatabaseWithDb(db);
    // Clean up leftover integration test artifacts
    await db
      .delete(schema.crisisIncidentsTable)
      .where(
        or(
          inArray(schema.crisisIncidentsTable.courseId, ['course-abc', 'pulse-course']),
          inArray(schema.crisisIncidentsTable.triggerSnippet, ['pg triage test', 'crisis snippet', 'suicide']),
        ),
      );

    await db
      .delete(schema.conversationsTable)
      .where(
        or(
          like(schema.conversationsTable.courseId, 'canvas-live-%'),
          inArray(schema.conversationsTable.courseId, ['course-abc', 'pulse-course']),
        ),
      );

    await db
      .delete(schema.courseSettingsTable)
      .where(
        or(
          like(schema.courseSettingsTable.courseId, 'canvas-live-%'),
          inArray(schema.courseSettingsTable.courseId, ['course-abc', 'pulse-course']),
        ),
      );

    await db
      .delete(schema.coursesTable)
      .where(
        or(
          like(schema.coursesTable.id, 'canvas-live-%'),
          inArray(schema.coursesTable.id, ['course-abc', 'pulse-course']),
        ),
      );

    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 3_600_000);

    // Seed demo_student (user-1001) and demo_instructor (user-2001) conversations
    const demoConversations = [
      {
        id: '11111111-1111-4111-8111-111111111101',
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        userId: 'user-1001',
        role: 'student',
        title: 'Headspace Tolerance & GO/NO-GO Gauges',
        scaffoldingState: {
          activeConcept: 'headspace tolerance',
          attemptCount: 2,
          hintLevel: 2 as const,
        },
        createdAt: hoursAgo(26),
        updatedAt: hoursAgo(25),
      },
      {
        id: '11111111-1111-4111-8111-111111111102',
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        userId: 'user-1001',
        role: 'student',
        title: 'Late Submission Policy & Lab Extensions',
        scaffoldingState: { attemptCount: 0, hintLevel: 1 as const },
        createdAt: hoursAgo(18),
        updatedAt: hoursAgo(18),
      },
      {
        id: '11111111-1111-4111-8111-111111111103',
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        userId: 'user-1001',
        role: 'student',
        title: 'Greenhill Rifling Twist Rate Formula',
        scaffoldingState: {
          activeConcept: 'greenhill twist rate',
          attemptCount: 1,
          hintLevel: 1 as const,
        },
        createdAt: hoursAgo(6),
        updatedAt: hoursAgo(6),
      },
      {
        id: '11111111-1111-4111-8111-111111111104',
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        userId: 'user-1001',
        role: 'student',
        title: 'Safety Lab 1 Rubric & Checklist',
        scaffoldingState: {
          activeConcept: 'safety lab checklist',
          attemptCount: 1,
          hintLevel: 1 as const,
        },
        createdAt: hoursAgo(2),
        updatedAt: hoursAgo(2),
      },
      {
        id: '11111111-1111-4111-8111-111111111106',
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        userId: 'user-1001',
        role: 'student',
        title: 'Muzzle Energy Calculation Check (55gr @ 3100 fps)',
        scaffoldingState: {
          activeConcept: 'muzzle energy unit conversion',
          attemptCount: 1,
          hintLevel: 1 as const,
        },
        createdAt: hoursAgo(36),
        updatedAt: hoursAgo(36),
      },
      {
        id: '11111111-1111-4111-8111-111111111107',
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        userId: 'user-1001',
        role: 'student',
        title: 'Chamber Casting Safety & Cerrosafe Prep',
        scaffoldingState: {
          activeConcept: 'chamber casting safety',
          attemptCount: 2,
          hintLevel: 2 as const,
        },
        createdAt: hoursAgo(48),
        updatedAt: hoursAgo(48),
      },
      {
        id: '11111111-1111-4111-8111-111111111108',
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        userId: 'user-1001',
        role: 'student',
        title: 'Blueprint Datum Tolerances (+/- 0.002 in)',
        scaffoldingState: {
          activeConcept: 'blueprint datum tolerances',
          attemptCount: 1,
          hintLevel: 1 as const,
        },
        createdAt: hoursAgo(72),
        updatedAt: hoursAgo(72),
      },
      {
        id: '11111111-1111-4111-8111-111111111109',
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        userId: 'user-1001',
        role: 'student',
        title: 'Cross-Course Study Plan for Thanksgiving Week',
        scaffoldingState: { attemptCount: 0, hintLevel: 1 as const },
        createdAt: hoursAgo(96),
        updatedAt: hoursAgo(96),
      },
      {
        id: '11111111-1111-4111-8111-111111111110',
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        userId: 'user-2001',
        role: 'instructor',
        title: 'Submission Stats & Unsubmitted Lab Follow-up',
        scaffoldingState: null,
        createdAt: hoursAgo(20),
        updatedAt: hoursAgo(20),
      },
      {
        id: '11111111-1111-4111-8111-111111111105',
        collegeId: 'sdi',
        courseId: 'sdi-ftt101',
        userId: 'user-2001',
        role: 'instructor',
        title: 'Week 2 Safety Announcement Draft',
        scaffoldingState: null,
        createdAt: hoursAgo(12),
        updatedAt: hoursAgo(12),
      },
    ];

    await db.insert(schema.conversationsTable).values(demoConversations).onConflictDoNothing();

    // Seed messages for those demo conversations
    const demoMessages = [
      {
        id: '22222222-2222-4222-8222-222222222101',
        conversationId: '11111111-1111-4111-8111-111111111101',
        role: 'user',
        content: 'How do I tell whether a bolt should close on a GO gauge vs a NO-GO gauge?',
        citations: [],
        isCrisis: false,
        createdAt: hoursAgo(26),
      },
      {
        id: '22222222-2222-4222-8222-222222222102',
        conversationId: '11111111-1111-4111-8111-111111111101',
        role: 'assistant',
        content:
          'Great question! Think about what each gauge represents in terms of minimum and maximum safe chamber dimensions. Which gauge confirms the chamber is **at least** the minimum SAAMI specification?',
        citations: [{ type: 'page', title: 'Module 1: Headspace Basics', url: 'welcome-to-sdi' }],
        isCrisis: false,
        createdAt: hoursAgo(25),
      },
      {
        id: '22222222-2222-4222-8222-222222222103',
        conversationId: '11111111-1111-4111-8111-111111111102',
        role: 'user',
        content: 'What does the syllabus say about late submissions?',
        citations: [],
        isCrisis: false,
        createdAt: hoursAgo(18),
      },
      {
        id: '22222222-2222-4222-8222-222222222104',
        conversationId: '11111111-1111-4111-8111-111111111102',
        role: 'assistant',
        content:
          'Per the FTT-101 syllabus, late work is accepted up to **3 days** past the deadline with a **10% penalty**.',
        citations: [{ type: 'syllabus', title: 'FTT-101 Course Syllabus' }],
        isCrisis: false,
        createdAt: hoursAgo(18),
      },
      {
        id: '22222222-2222-4222-8222-222222222105',
        conversationId: '11111111-1111-4111-8111-111111111103',
        role: 'user',
        content: 'Can you help me start the Greenhill twist rate calculation for a .224 bullet?',
        citations: [],
        isCrisis: false,
        createdAt: hoursAgo(6),
      },
      {
        id: '22222222-2222-4222-8222-222222222106',
        conversationId: '11111111-1111-4111-8111-111111111103',
        role: 'assistant',
        content:
          'Let us break down the Greenhill formula: $T = \\frac{150 \\times D^2}{L}$. What values do you have for diameter $D$ and bullet length $L$ in inches?',
        citations: [],
        isCrisis: false,
        createdAt: hoursAgo(6),
      },
      {
        id: '22222222-2222-4222-8222-222222222107',
        conversationId: '11111111-1111-4111-8111-111111111105',
        role: 'user',
        content: 'Draft a short Week 2 reminder about chamber safety and blueprint due dates.',
        citations: [],
        isCrisis: false,
        createdAt: hoursAgo(12),
      },
      {
        id: '22222222-2222-4222-8222-222222222108',
        conversationId: '11111111-1111-4111-8111-111111111105',
        role: 'assistant',
        content:
          '### Week 2 Reminder: Chamber Safety & Blueprint Analysis\n\nHi everyone — before starting **Week 2 Blueprint Analysis**, please verify your bench is clear of live ammunition and review the Module 2 tolerance callouts.',
        citations: [{ type: 'assignment', title: 'Week 2 Blueprint Analysis' }],
        isCrisis: false,
        createdAt: hoursAgo(12),
      },
    ];

    await db.insert(schema.messagesTable).values(demoMessages).onConflictDoNothing();

    // Seed k-anonymous cohort threads (>= 5 distinct students) for Class Confusion Pulse
    const cohortPulseSeeds = [
      { id: '33333333-3333-4333-8333-333333333101', userId: 'demo-cohort-1', concept: 'headspace tolerance' },
      { id: '33333333-3333-4333-8333-333333333102', userId: 'demo-cohort-2', concept: 'headspace tolerance' },
      { id: '33333333-3333-4333-8333-333333333103', userId: 'demo-cohort-3', concept: 'headspace tolerance' },
      { id: '33333333-3333-4333-8333-333333333104', userId: 'demo-cohort-4', concept: 'headspace tolerance' },
      { id: '33333333-3333-4333-8333-333333333105', userId: 'demo-cohort-5', concept: 'headspace tolerance' },
      { id: '33333333-3333-4333-8333-333333333106', userId: 'demo-cohort-6', concept: 'greenhill twist rate' },
      { id: '33333333-3333-4333-8333-333333333107', userId: 'demo-cohort-7', concept: 'greenhill twist rate' },
      { id: '33333333-3333-4333-8333-333333333108', userId: 'demo-cohort-8', concept: 'greenhill twist rate' },
      { id: '33333333-3333-4333-8333-333333333109', userId: 'demo-cohort-9', concept: 'greenhill twist rate' },
      { id: '33333333-3333-4333-8333-333333333110', userId: 'demo-cohort-10', concept: 'primer ignition sensitivity' },
      { id: '33333333-3333-4333-8333-333333333111', userId: 'demo-cohort-11', concept: 'primer ignition sensitivity' },
      { id: '33333333-3333-4333-8333-333333333112', userId: 'demo-cohort-12', concept: 'primer ignition sensitivity' },
      { id: '33333333-3333-4333-8333-333333333113', userId: 'demo-cohort-13', concept: 'blueprint datum tolerances' },
      { id: '33333333-3333-4333-8333-333333333114', userId: 'demo-cohort-14', concept: 'blueprint datum tolerances' },
      { id: '33333333-3333-4333-8333-333333333115', userId: 'demo-cohort-15', concept: 'blueprint datum tolerances' },
      { id: '33333333-3333-4333-8333-333333333116', userId: 'demo-cohort-16', concept: 'chamber casting safety' },
      { id: '33333333-3333-4333-8333-333333333117', userId: 'demo-cohort-17', concept: 'chamber casting safety' },
      { id: '33333333-3333-4333-8333-333333333118', userId: 'demo-cohort-18', concept: 'muzzle energy unit conversion' },
    ];

    await db
      .insert(schema.conversationsTable)
      .values(
        cohortPulseSeeds.map((c, idx) => ({
          id: c.id,
          collegeId: 'sdi',
          courseId: 'sdi-ftt101',
          userId: c.userId,
          role: 'student',
          title: `Cohort Practice: ${c.concept}`,
          scaffoldingState: {
            activeConcept: c.concept,
            attemptCount: 1,
            hintLevel: 1 as const,
          },
          createdAt: hoursAgo(24 - idx),
          updatedAt: hoursAgo(24 - idx),
        })),
      )
      .onConflictDoNothing();

    // Seed realistic synthetic FERPA § 99.36 crisis triage items
    await db
      .insert(schema.crisisIncidentsTable)
      .values([
        {
          id: '44444444-4444-4444-8444-444444444101',
          collegeId: 'sdi',
          courseId: 'sdi-ftt101',
          studentId: 'demo-cohort-2',
          category: 'self_harm',
          triggerSnippet: '[Synthetic Demo] I feel overwhelmed and do not want to keep going',
          responseRendered: '988 Suicide & Crisis Lifeline resources presented.',
          status: 'new',
          reviewedBy: null as string | null,
          reviewedAt: null as Date | null,
          createdAt: hoursAgo(3),
        },
        {
          id: '44444444-4444-4444-8444-444444444102',
          collegeId: 'sdi',
          courseId: 'sdi-ftt101',
          studentId: 'demo-cohort-4',
          category: 'severe_distress',
          triggerSnippet: '[Synthetic Demo] Experiencing acute panic and need help tonight',
          responseRendered: '988 Suicide & Crisis Lifeline resources presented.',
          status: 'acknowledged',
          reviewedBy: 'user-2001',
          reviewedAt: hoursAgo(1),
          createdAt: hoursAgo(8),
        },
        {
          id: '44444444-4444-4444-8444-444444444103',
          collegeId: 'sdi',
          courseId: 'sdi-ftt101',
          studentId: 'demo-cohort-9',
          category: 'crisis_disclosed',
          triggerSnippet: '[Synthetic Demo] Everything feels hopeless and I cannot cope',
          responseRendered: '988 Suicide & Crisis Lifeline resources presented.',
          status: 'new',
          reviewedBy: null as string | null,
          reviewedAt: null as Date | null,
          createdAt: hoursAgo(1),
        },
        {
          id: '44444444-4444-4444-8444-444444444104',
          collegeId: 'sdi',
          courseId: 'sdi-ftt101',
          studentId: 'demo-cohort-12',
          category: 'self_harm',
          triggerSnippet: '[Synthetic Demo] Past resolved welfare check example',
          responseRendered: '988 Suicide & Crisis Lifeline resources presented.',
          status: 'resolved',
          reviewedBy: 'user-2001',
          reviewedAt: hoursAgo(20),
          createdAt: hoursAgo(36),
        },
      ])
      .onConflictDoNothing();

    // Seed persistent demo_student learning context
    await db
      .insert(schema.userLearningContextsTable)
      .values({
        userId: 'user-1001',
        collegeId: 'sdi',
        preferredStyle: 'step-by-step explanations',
        recurringTopics: ['headspace tolerance', 'greenhill twist rate'],
        notes: 'Prefers explicit unit conversions (grains, fps, inches) and safety-first checklists.',
      })
      .onConflictDoNothing();
}

/**
 * Populates rich, idempotent synthetic demo data (conversations, messages,
 * k-anonymous confusion pulse cohort threads, and crisis triage queue items)
 * and removes leftover automated test rows.
 */
export async function seedDemoData(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql, { schema });

  try {
    await seedDemoDataWithDb(db);
    console.log('Synthetic demo dataset seeded successfully.');
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const url = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/virtual_ta';
  const runner = process.argv.includes('--demo') ? seedDemoData : seedDatabase;
  runner(url).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
