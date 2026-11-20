import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';

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
  setting: text('setting').notNull().default('full'), // 'full' | 'logistics_only'
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const conversationsTable = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  collegeId: text('college_id').notNull().references(() => collegesTable.id),
  courseId: text('course_id').notNull().references(() => coursesTable.id),
  userId: text('user_id').notNull(),
  role: text('role').notNull(), // 'student' | 'instructor'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const messagesTable = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversationsTable.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system' | 'tool'
  content: text('content').notNull(),
  citations: jsonb('citations').default([]).notNull(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
