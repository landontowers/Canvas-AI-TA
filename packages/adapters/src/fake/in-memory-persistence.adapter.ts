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
  TutorRole,
} from '@ai-tutor/core';
import crypto from 'node:crypto';

export class InMemoryPersistenceAdapter implements PersistencePort {
  private colleges = new Map<string, CollegeRecord>();
  private users = new Map<string, User>();
  private courses = new Map<string, Course>();
  private courseSettings = new Map<string, CourseSettings>();
  private conversations = new Map<string, Conversation>();
  private messages: Message[] = [];

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
    role: TutorRole;
  }): Promise<Conversation> {
    const id = crypto.randomUUID();
    const now = new Date();
    const conv: Conversation = {
      id,
      collegeId: params.collegeId,
      courseId: params.courseId,
      userId: params.userId,
      role: params.role,
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

  async saveMessage(params: {
    conversationId: string;
    role: MessageRole;
    content: string;
    citations?: Citation[];
  }): Promise<Message> {
    const msg: Message = {
      id: crypto.randomUUID(),
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      citations: params.citations || [],
      createdAt: new Date(),
    };
    this.messages.push(msg);

    const conv = this.conversations.get(params.conversationId);
    if (conv) {
      conv.updatedAt = new Date();
    }

    return msg;
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    return this.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async clearUserData(userId: string): Promise<void> {
    const userConvs = Array.from(this.conversations.values()).filter((c) => c.userId === userId);
    for (const conv of userConvs) {
      this.messages = this.messages.filter((m) => m.conversationId !== conv.id);
      this.conversations.delete(conv.id);
    }
    this.users.delete(userId);
  }
}
