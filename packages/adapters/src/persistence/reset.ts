import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

export async function resetDatabase(databaseUrl: string, courseId = 'sdi-ftt101') {
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql, { schema });

  try {
    // 1. Delete all conversation messages and conversations (critique §4.4)
    await db.delete(schema.messagesTable);
    await db.delete(schema.conversationsTable);

    // 2. Reset course setting back to 'full' (critique §3.4, §8)
    await db
      .insert(schema.courseSettingsTable)
      .values({
        courseId,
        setting: 'full',
      })
      .onConflictDoUpdate({
        target: schema.courseSettingsTable.courseId,
        set: {
          setting: 'full',
          updatedAt: new Date(),
        },
      });

    console.log(`Demo state reset successfully: conversations cleared, course ${courseId} setting restored to 'full'.`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith('reset.ts') || process.argv[1]?.endsWith('reset.js')) {
  const url = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/virtual_ta';
  resetDatabase(url).catch((err) => {
    console.error('Demo reset failed:', err);
    process.exit(1);
  });
}
