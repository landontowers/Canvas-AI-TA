import postgres from 'postgres';

export interface SqlExecutor {
  unsafe(query: string): Promise<unknown>;
  end?: () => Promise<void>;
}

export const MIGRATION_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS colleges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    lti_issuer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id TEXT NOT NULL REFERENCES colleges(id),
    external_canvas_id TEXT NOT NULL,
    name TEXT,
    email TEXT,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    college_id TEXT NOT NULL REFERENCES colleges(id),
    external_canvas_id TEXT NOT NULL,
    name TEXT NOT NULL,
    course_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS course_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id TEXT NOT NULL UNIQUE REFERENCES courses(id),
    setting TEXT NOT NULL DEFAULT 'full',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id TEXT NOT NULL REFERENCES colleges(id),
    course_id TEXT NOT NULL REFERENCES courses(id),
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    title TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title TEXT;`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0;`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_user_course ON conversations (user_id, course_id, updated_at DESC);`,
  `CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_crisis BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_crisis BOOLEAN NOT NULL DEFAULT FALSE;`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages (conversation_id, created_at ASC);`,
  `CREATE TABLE IF NOT EXISTS crisis_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id TEXT NOT NULL REFERENCES colleges(id),
    course_id TEXT NOT NULL REFERENCES courses(id),
    student_id TEXT NOT NULL,
    category TEXT NOT NULL,
    trigger_snippet TEXT NOT NULL,
    response_rendered TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
];

/**
 * Applies idempotent PostgreSQL DDL migrations matching packages/adapters/src/persistence/schema.ts.
 */
export async function runMigrations(
  databaseUrl: string,
  sqlExecutor?: SqlExecutor,
): Promise<void> {
  const client = sqlExecutor ?? postgres(databaseUrl, { max: 1 });
  const ownsClient = !sqlExecutor;

  try {
    for (const statement of MIGRATION_STATEMENTS) {
      await client.unsafe(statement);
    }
  } finally {
    if (ownsClient && client.end) {
      await client.end();
    }
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  const url =
    process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/ai_tutor';
  runMigrations(url)
    .then(() => {
      console.log('Database migrations applied successfully.');
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
