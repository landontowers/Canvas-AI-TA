import {
  PersistencePort,
  CollegeRecord,
  User,
  Course,
  CourseSettings,
  CourseSettingValue,
  Conversation,
  Message,
  MessageRole,
  Citation,
  AssistantRole,
  CrisisIncident,
  ScaffoldingState,
} from '@virtual-ta/core';
import { eq, and, desc, lt, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDrizzlePersistence(databaseUrl: string): {
  adapter: DrizzlePersistenceAdapter;
  close: () => Promise<void>;
} {
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });
  return {
    adapter: new DrizzlePersistenceAdapter(db),
    close: async () => {
      await client.end();
    },
  };
}

export class DrizzlePersistenceAdapter implements PersistencePort {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  async getCollege(collegeId: string): Promise<CollegeRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.collegesTable)
      .where(eq(schema.collegesTable.id, collegeId))
      .limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      name: rows[0].name,
      domain: rows[0].domain,
      ltiIssuer: rows[0].ltiIssuer || undefined,
      createdAt: rows[0].createdAt,
    };
  }

  async upsertCollege(college: CollegeRecord): Promise<CollegeRecord> {
    await this.db
      .insert(schema.collegesTable)
      .values({
        id: college.id,
        name: college.name,
        domain: college.domain,
        ltiIssuer: college.ltiIssuer,
        createdAt: college.createdAt,
      })
      .onConflictDoUpdate({
        target: schema.collegesTable.id,
        set: {
          name: college.name,
          domain: college.domain,
          ltiIssuer: college.ltiIssuer,
        },
      });
    return college;
  }

  async getUser(userId: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.id, userId))
      .limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      collegeId: rows[0].collegeId,
      externalCanvasId: rows[0].externalCanvasId,
      name: rows[0].name || undefined,
      email: rows[0].email || undefined,
      role: rows[0].role as AssistantRole,
      createdAt: rows[0].createdAt,
    };
  }

  async getUserByExternalCanvasId(collegeId: string, externalCanvasId: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.usersTable)
      .where(
        and(
          eq(schema.usersTable.collegeId, collegeId),
          eq(schema.usersTable.externalCanvasId, externalCanvasId),
        ),
      )
      .limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      collegeId: rows[0].collegeId,
      externalCanvasId: rows[0].externalCanvasId,
      name: rows[0].name || undefined,
      email: rows[0].email || undefined,
      role: rows[0].role as AssistantRole,
      createdAt: rows[0].createdAt,
    };
  }

  async upsertUser(user: Omit<User, 'id' | 'createdAt'> & { id?: string }): Promise<User> {
    const existing = user.id ? await this.getUser(user.id) : null;
    if (existing) {
      await this.db
        .update(schema.usersTable)
        .set({
          name: user.name,
          email: user.email,
          role: user.role,
        })
        .where(eq(schema.usersTable.id, existing.id));
      return {
        ...existing,
        name: user.name,
        email: user.email,
        role: user.role,
      };
    }

    const inserted = await this.db
      .insert(schema.usersTable)
      .values({
        collegeId: user.collegeId,
        externalCanvasId: user.externalCanvasId,
        name: user.name,
        email: user.email,
        role: user.role,
      })
      .returning();

    return {
      id: inserted[0].id,
      collegeId: inserted[0].collegeId,
      externalCanvasId: inserted[0].externalCanvasId,
      name: inserted[0].name || undefined,
      email: inserted[0].email || undefined,
      role: inserted[0].role as AssistantRole,
      createdAt: inserted[0].createdAt,
    };
  }

  async getCourse(courseId: string): Promise<Course | null> {
    const rows = await this.db
      .select()
      .from(schema.coursesTable)
      .where(eq(schema.coursesTable.id, courseId))
      .limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      collegeId: rows[0].collegeId,
      externalCanvasId: rows[0].externalCanvasId,
      name: rows[0].name,
      courseCode: rows[0].courseCode,
      createdAt: rows[0].createdAt,
    };
  }

  async upsertCourse(course: Course): Promise<Course> {
    await this.db
      .insert(schema.coursesTable)
      .values({
        id: course.id,
        collegeId: course.collegeId,
        externalCanvasId: course.externalCanvasId,
        name: course.name,
        courseCode: course.courseCode,
      })
      .onConflictDoUpdate({
        target: schema.coursesTable.id,
        set: {
          name: course.name,
          courseCode: course.courseCode,
        },
      });
    return course;
  }

  async getCourseSettings(courseId: string): Promise<CourseSettings> {
    const rows = await this.db
      .select()
      .from(schema.courseSettingsTable)
      .where(eq(schema.courseSettingsTable.courseId, courseId))
      .limit(1);

    if (rows[0]) {
      return {
        id: rows[0].id,
        courseId: rows[0].courseId,
        setting: rows[0].setting as CourseSettingValue,
        updatedAt: rows[0].updatedAt,
      };
    }

    const inserted = await this.db
      .insert(schema.courseSettingsTable)
      .values({
        courseId,
        setting: 'full',
      })
      .returning();

    return {
      id: inserted[0].id,
      courseId: inserted[0].courseId,
      setting: inserted[0].setting as CourseSettingValue,
      updatedAt: inserted[0].updatedAt,
    };
  }

  async updateCourseSettings(
    courseId: string,
    setting: CourseSettingValue,
  ): Promise<CourseSettings> {
    const rows = await this.db
      .insert(schema.courseSettingsTable)
      .values({
        courseId,
        setting,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.courseSettingsTable.courseId,
        set: {
          setting,
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      id: rows[0].id,
      courseId: rows[0].courseId,
      setting: rows[0].setting as CourseSettingValue,
      updatedAt: rows[0].updatedAt,
    };
  }

  async createConversation(params: {
    collegeId: string;
    courseId: string;
    userId: string;
    role: AssistantRole;
  }): Promise<Conversation> {
    const inserted = await this.db
      .insert(schema.conversationsTable)
      .values({
        collegeId: params.collegeId,
        courseId: params.courseId,
        userId: params.userId,
        role: params.role,
      })
      .returning();

    return {
      id: inserted[0].id,
      collegeId: inserted[0].collegeId,
      courseId: inserted[0].courseId,
      userId: inserted[0].userId,
      role: inserted[0].role as AssistantRole,
      title: inserted[0].title || undefined,
      messageCount: inserted[0].messageCount,
      scaffoldingState: (inserted[0].scaffoldingState as ScaffoldingState) || undefined,
      createdAt: inserted[0].createdAt,
      updatedAt: inserted[0].updatedAt,
    };
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const rows = await this.db
      .select()
      .from(schema.conversationsTable)
      .where(eq(schema.conversationsTable.id, conversationId))
      .limit(1);

    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      collegeId: rows[0].collegeId,
      courseId: rows[0].courseId,
      userId: rows[0].userId,
      role: rows[0].role as AssistantRole,
      title: rows[0].title || undefined,
      messageCount: rows[0].messageCount,
      scaffoldingState: (rows[0].scaffoldingState as ScaffoldingState) || undefined,
      createdAt: rows[0].createdAt,
      updatedAt: rows[0].updatedAt,
    };
  }

  async listConversations(userId: string, courseId: string): Promise<Conversation[]> {
    const rows = await this.db
      .select()
      .from(schema.conversationsTable)
      .where(
        and(
          eq(schema.conversationsTable.userId, userId),
          eq(schema.conversationsTable.courseId, courseId),
        ),
      )
      .orderBy(desc(schema.conversationsTable.updatedAt));

    return rows.map((r) => ({
      id: r.id,
      collegeId: r.collegeId,
      courseId: r.courseId,
      userId: r.userId,
      role: r.role as AssistantRole,
      title: r.title || undefined,
      messageCount: r.messageCount,
      scaffoldingState: (r.scaffoldingState as ScaffoldingState) || undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async updateConversationScaffoldingState(
    conversationId: string,
    scaffoldingState: ScaffoldingState,
  ): Promise<Conversation | null> {
    const rows = await this.db
      .update(schema.conversationsTable)
      .set({
        scaffoldingState,
        updatedAt: new Date(),
      })
      .where(eq(schema.conversationsTable.id, conversationId))
      .returning();

    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      collegeId: rows[0].collegeId,
      courseId: rows[0].courseId,
      userId: rows[0].userId,
      role: rows[0].role as AssistantRole,
      title: rows[0].title || undefined,
      messageCount: rows[0].messageCount,
      scaffoldingState: (rows[0].scaffoldingState as ScaffoldingState) || undefined,
      createdAt: rows[0].createdAt,
      updatedAt: rows[0].updatedAt,
    };
  }

  async saveMessage(params: {
    conversationId: string;
    role: MessageRole;
    content: string;
    citations?: Citation[];
    isCrisis?: boolean;
  }): Promise<Message> {
    const inserted = await this.db
      .insert(schema.messagesTable)
      .values({
        conversationId: params.conversationId,
        role: params.role,
        content: params.content,
        citations: params.citations || [],
        isCrisis: Boolean(params.isCrisis),
      })
      .returning();

    const candidateTitle =
      params.role === 'user'
        ? params.content.slice(0, 50).trim() + (params.content.length > 50 ? '...' : '')
        : undefined;

    await this.db
      .update(schema.conversationsTable)
      .set({
        updatedAt: new Date(),
        messageCount: sql`${schema.conversationsTable.messageCount} + 1`,
        ...(candidateTitle
          ? { title: sql`COALESCE(${schema.conversationsTable.title}, ${candidateTitle})` }
          : {}),
      })
      .where(eq(schema.conversationsTable.id, params.conversationId));

    return {
      id: inserted[0].id,
      conversationId: inserted[0].conversationId,
      role: inserted[0].role as MessageRole,
      content: inserted[0].content,
      citations: (inserted[0].citations as Citation[]) || [],
      isCrisis: inserted[0].isCrisis || undefined,
      createdAt: inserted[0].createdAt,
    };
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(schema.messagesTable)
      .where(eq(schema.messagesTable.conversationId, conversationId))
      .orderBy(schema.messagesTable.createdAt);

    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      role: r.role as MessageRole,
      content: r.content,
      citations: (r.citations as Citation[]) || [],
      isCrisis: r.isCrisis || undefined,
      createdAt: r.createdAt,
    }));
  }

  async saveCrisisIncident(incident: {
    collegeId: string;
    courseId: string;
    studentId: string;
    category: string;
    triggerSnippet: string;
    responseRendered: string;
  }): Promise<CrisisIncident> {
    const inserted = await this.db
      .insert(schema.crisisIncidentsTable)
      .values({
        collegeId: incident.collegeId,
        courseId: incident.courseId,
        studentId: incident.studentId,
        category: incident.category,
        triggerSnippet: incident.triggerSnippet,
        responseRendered: incident.responseRendered,
      })
      .returning();

    return {
      id: inserted[0].id,
      collegeId: inserted[0].collegeId,
      courseId: inserted[0].courseId,
      studentId: inserted[0].studentId,
      category: inserted[0].category,
      triggerSnippet: inserted[0].triggerSnippet,
      responseRendered: inserted[0].responseRendered,
      timestamp: inserted[0].createdAt,
    };
  }

  async listCrisisIncidents(collegeId: string): Promise<CrisisIncident[]> {
    const rows = await this.db
      .select()
      .from(schema.crisisIncidentsTable)
      .where(eq(schema.crisisIncidentsTable.collegeId, collegeId))
      .orderBy(desc(schema.crisisIncidentsTable.createdAt));

    return rows.map((r) => ({
      id: r.id,
      collegeId: r.collegeId,
      courseId: r.courseId,
      studentId: r.studentId,
      category: r.category,
      triggerSnippet: r.triggerSnippet,
      responseRendered: r.responseRendered,
      timestamp: r.createdAt,
    }));
  }

  async clearUserData(userId: string): Promise<void> {
    const convs = await this.db
      .select({ id: schema.conversationsTable.id })
      .from(schema.conversationsTable)
      .where(eq(schema.conversationsTable.userId, userId));

    for (const c of convs) {
      await this.db
        .delete(schema.messagesTable)
        .where(eq(schema.messagesTable.conversationId, c.id));
      await this.db
        .delete(schema.conversationsTable)
        .where(eq(schema.conversationsTable.id, c.id));
    }

    if (UUID_REGEX.test(userId)) {
      await this.db.delete(schema.usersTable).where(eq(schema.usersTable.id, userId));
    } else {
      const canvasId = userId.startsWith('user-') ? userId.slice(5) : userId;
      await this.db
        .delete(schema.usersTable)
        .where(eq(schema.usersTable.externalCanvasId, canvasId));
    }
  }

  async resetDemo(courseId = 'sdi-ftt101'): Promise<void> {
    await this.db.delete(schema.messagesTable);
    await this.db.delete(schema.conversationsTable);
    await this.db
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
  }

  async purgeExpiredConversations(
    retentionDays: number,
    now: Date = new Date(),
  ): Promise<{ deletedConversations: number; deletedMessages: number }> {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const expired = await this.db
      .select({ id: schema.conversationsTable.id })
      .from(schema.conversationsTable)
      .where(lt(schema.conversationsTable.updatedAt, cutoff));

    if (expired.length === 0) {
      return { deletedConversations: 0, deletedMessages: 0 };
    }

    let deletedMessages = 0;
    for (const conv of expired) {
      const removedMsgs = await this.db
        .delete(schema.messagesTable)
        .where(eq(schema.messagesTable.conversationId, conv.id))
        .returning({ id: schema.messagesTable.id });
      deletedMessages += removedMsgs.length;
      await this.db
        .delete(schema.conversationsTable)
        .where(eq(schema.conversationsTable.id, conv.id));
    }

    return {
      deletedConversations: expired.length,
      deletedMessages,
    };
  }
}
