import { pgTable, text, timestamp, uuid, jsonb, integer, boolean } from 'drizzle-orm/pg-core';

export const collegesTable = pgTable('colleges', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  ltiIssuer: text('lti_issuer'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersTable = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  collegeId: text('college_id').notNull().references(() => collegesTable.id),
  externalCanvasId: text('external_canvas_id').notNull(),
  name: text('name'),
  email: text('email'),
  role: text('role').notNull(), // 'student' | 'instructor'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const coursesTable = pgTable('courses', {
  id: text('id').primaryKey(),
  collegeId: text('college_id').notNull().references(() => collegesTable.id),
  externalCanvasId: text('external_canvas_id').notNull(),
  name: text('name').notNull(),
  courseCode: text('course_code').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const courseSettingsTable = pgTable('course_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: text('course_id').notNull().unique().references(() => coursesTable.id),
  setting: text('setting').notNull().default('full'), // 'full' | 'logistics_only' | 'off'
  blackoutStart: timestamp('blackout_start', { withTimezone: true }),
  blackoutEnd: timestamp('blackout_end', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const conversationsTable = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  collegeId: text('college_id').notNull().references(() => collegesTable.id),
  courseId: text('course_id').notNull().references(() => coursesTable.id),
  userId: text('user_id').notNull(),
  role: text('role').notNull(), // 'student' | 'instructor'
  title: text('title'),
  messageCount: integer('message_count').default(0).notNull(),
  scaffoldingState: jsonb('scaffolding_state'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const messagesTable = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversationsTable.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system' | 'tool'
  content: text('content').notNull(),
  citations: jsonb('citations').default([]).notNull(),
  isCrisis: boolean('is_crisis').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Isolated crisis incidents log under the FERPA Health & Safety Emergency Exception (34 CFR § 99.36).
 * Segregated from regular chat conversations and restricted to authorized student care authorities.
 */
export const crisisIncidentsTable = pgTable('crisis_incidents', {
  id: uuid('id').defaultRandom().primaryKey(),
  collegeId: text('college_id').notNull().references(() => collegesTable.id),
  courseId: text('course_id').notNull().references(() => coursesTable.id),
  studentId: text('student_id').notNull(),
  category: text('category').notNull(),
  triggerSnippet: text('trigger_snippet').notNull(),
  responseRendered: text('response_rendered').notNull(),
  status: text('status').default('new').notNull(),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
