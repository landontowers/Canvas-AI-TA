import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';
import { SDI_COLLEGE_CONFIG } from '../config/sdi.config.js';

export async function seedDatabase(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql, { schema });

  try {
    // 1. Seed SDI college
    await db
      .insert(schema.collegesTable)
      .values({
        id: SDI_COLLEGE_CONFIG.id,
        name: SDI_COLLEGE_CONFIG.name,
        domain: SDI_COLLEGE_CONFIG.domain,
      })
      .onConflictDoNothing();

    // 2. Seed sandbox course
    await db
      .insert(schema.coursesTable)
      .values({
        id: 'sdi-ftt101',
        collegeId: SDI_COLLEGE_CONFIG.id,
        externalCanvasId: 'course_101',
        name: 'FTT-101: Firearms Safety & Fundamentals',
        courseCode: 'FTT-101',
      })
      .onConflictDoNothing();

    // 3. Seed default course setting ('full')
    await db
      .insert(schema.courseSettingsTable)
      .values({
        courseId: 'sdi-ftt101',
        setting: 'full',
      })
      .onConflictDoNothing();

    console.log('Database seeded successfully with SDI college and FTT-101 sandbox course.');
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const url = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/virtual_ta';
  seedDatabase(url).catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
