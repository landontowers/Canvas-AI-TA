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
import crypto from 'node:crypto';

export class InMemoryPersistenceAdapter implements PersistencePort {
  private colleges = new Map<string, CollegeRecord>();
  private users = new Map<string, User>();
  private courses = new Map<string, Course>();
  private courseSettings = new Map<string, CourseSettings>();
  private conversations = new Map<string, Conversation>();
  private messages: Message[] = [];
  private crisisIncidents: CrisisIncident[] = [];

  async getCollege(collegeId: string): Promise<CollegeRecord | null> {
    return this.colleges.get(collegeId) || null;
  }

  async upsertCollege(college: CollegeRecord): Promise<CollegeRecord> {
    this.colleges.set(college.id, college);
    return college;
  }

  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async getUserByExternalCanvasId(collegeId: string, externalCanvasId: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.collegeId === collegeId && user.externalCanvasId === externalCanvasId) {
        return user;
      }
    }
    return null;
  }

  async upsertUser(user: Omit<User, 'id' | 'createdAt'> & { id?: string }): Promise<User> {
    const existing = user.id ? this.users.get(user.id) : null;
    const id = existing?.id || user.id || crypto.randomUUID();
    const createdAt = existing?.createdAt || new Date();

    const record: User = {
      ...user,
      id,
      createdAt,
    };
    this.users.set(id, record);
    return record;
  }

  async getCourse(courseId: string): Promise<Course | null> {
    return this.courses.get(courseId) || null;
  }

  async upsertCourse(course: Course): Promise<Course> {
    this.courses.set(course.id, course);
    return course;
  }

  async getCourseSettings(courseId: string): Promise<CourseSettings> {
    const found = this.courseSettings.get(courseId);
    if (found) {
      return found;
    }
    const defaultSettings: CourseSettings = {
      id: crypto.randomUUID(),
      courseId,
      setting: 'full',
      updatedAt: new Date(),
    };
    this.courseSettings.set(courseId, defaultSettings);
    return defaultSettings;
  }

  async updateCourseSettings(
    courseId: string,
    setting: CourseSettingValue,
  ): Promise<CourseSettings> {
    const existing = await this.getCourseSettings(courseId);
    const updated: CourseSettings = {
      ...existing,
      setting,
      updatedAt: new Date(),
    };
    this.courseSettings.set(courseId, updated);
    return updated;
  }

  async createConversation(params: {
    collegeId: string;
    courseId: string;
    userId: string;
    role: AssistantRole;
  }): Promise<Conversation> {
    const id = crypto.randomUUID();
    const now = new Date();
    const conv: Conversation = {
      id,
      collegeId: params.collegeId,
      courseId: params.courseId,
      userId: params.userId,
      role: params.role,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, conv);
    return conv;
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    return this.conversations.get(conversationId) || null;
  }

  async listConversations(userId: string, courseId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).filter(
      (c) => c.userId === userId && c.courseId === courseId,
    );
  }

  async updateConversationScaffoldingState(
    conversationId: string,
    scaffoldingState: ScaffoldingState,
  ): Promise<Conversation | null> {
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;
    conv.scaffoldingState = scaffoldingState;
    conv.updatedAt = new Date();
    return conv;
  }

  async saveMessage(params: {
    conversationId: string;
    role: MessageRole;
    content: string;
    citations?: Citation[];
    isCrisis?: boolean;
  }): Promise<Message> {
    const msg: Message = {
      id: crypto.randomUUID(),
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      citations: params.citations || [],
      isCrisis: params.isCrisis || undefined,
      createdAt: new Date(),
    };
    this.messages.push(msg);

    const conv = this.conversations.get(params.conversationId);
    if (conv) {
      conv.updatedAt = new Date();
      conv.messageCount = (conv.messageCount ?? 0) + 1;
      if (!conv.title && params.role === 'user') {
        conv.title = params.content.slice(0, 50).trim() + (params.content.length > 50 ? '...' : '');
      }
    }

    return msg;
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    return this.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async saveCrisisIncident(incident: {
    collegeId: string;
    courseId: string;
    studentId: string;
    category: string;
    triggerSnippet: string;
    responseRendered: string;
  }): Promise<CrisisIncident> {
    const record: CrisisIncident = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...incident,
    };
    this.crisisIncidents.push(record);
    return record;
  }

  async listCrisisIncidents(collegeId: string): Promise<CrisisIncident[]> {
    return this.crisisIncidents
      .filter((i) => i.collegeId === collegeId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async clearUserData(userId: string): Promise<void> {
    const userConvs = Array.from(this.conversations.values()).filter((c) => c.userId === userId);
    for (const conv of userConvs) {
      this.messages = this.messages.filter((m) => m.conversationId !== conv.id);
      this.conversations.delete(conv.id);
    }
    this.users.delete(userId);
  }

  async resetDemo(courseId = 'sdi-ftt101'): Promise<void> {
    this.conversations.clear();
    this.messages = [];
    this.courseSettings.set(courseId, {
      id: crypto.randomUUID(),
      courseId,
      setting: 'full',
      updatedAt: new Date(),
    });
  }

  async purgeExpiredConversations(
    retentionDays: number,
    now: Date = new Date(),
  ): Promise<{ deletedConversations: number; deletedMessages: number }> {
    const cutoffMs = now.getTime() - retentionDays * 86_400_000;
    const expiredIds = new Set<string>();

    for (const [id, conv] of this.conversations.entries()) {
      if (conv.updatedAt.getTime() < cutoffMs) {
        expiredIds.add(id);
      }
    }

    if (expiredIds.size === 0) {
      return { deletedConversations: 0, deletedMessages: 0 };
    }

    const beforeMessages = this.messages.length;
    this.messages = this.messages.filter((m) => !expiredIds.has(m.conversationId));
    const deletedMessages = beforeMessages - this.messages.length;

    for (const id of expiredIds) {
      this.conversations.delete(id);
    }

    return {
      deletedConversations: expiredIds.size,
      deletedMessages,
    };
  }
}
