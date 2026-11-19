import {
  User,
  Course,
  CourseSettings,
  CourseSettingValue,
  Conversation,
  Message,
  MessageRole,
  Citation,
  TutorRole,
} from '../types/index.js';

export interface CollegeRecord {
  id: string;
  name: string;
  domain: string;
  ltiIssuer?: string;
  createdAt: Date;
}

export interface PersistencePort {
  getCollege(collegeId: string): Promise<CollegeRecord | null>;
  upsertCollege(college: CollegeRecord): Promise<CollegeRecord>;

  getUser(userId: string): Promise<User | null>;
  getUserByExternalCanvasId(collegeId: string, externalCanvasId: string): Promise<User | null>;
  upsertUser(user: Omit<User, 'id' | 'createdAt'> & { id?: string }): Promise<User>;

  getCourse(courseId: string): Promise<Course | null>;
  upsertCourse(course: Course): Promise<Course>;

  getCourseSettings(courseId: string): Promise<CourseSettings>;
  updateCourseSettings(courseId: string, setting: CourseSettingValue): Promise<CourseSettings>;

  createConversation(params: {
    collegeId: string;
    courseId: string;
    userId: string;
    role: TutorRole;
  }): Promise<Conversation>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  listConversations(userId: string, courseId: string): Promise<Conversation[]>;

  saveMessage(params: {
    conversationId: string;
    role: MessageRole;
    content: string;
    citations?: Citation[];
  }): Promise<Message>;
  listMessages(conversationId: string): Promise<Message[]>;

  clearUserData(userId: string): Promise<void>;
}
