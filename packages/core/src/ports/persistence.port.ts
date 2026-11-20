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
import { TutoringState } from '../policy/hint-ladder.js';

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
  updateConversationTutoringState(
    conversationId: string,
    tutoringState: TutoringState,
  ): Promise<Conversation | null>;

  saveMessage(params: {
    conversationId: string;
    role: MessageRole;
    content: string;
    citations?: Citation[];
    isCrisis?: boolean;
  }): Promise<Message>;
  listMessages(conversationId: string): Promise<Message[]>;

  // Crisis incidents (FERPA 34 CFR § 99.36 Health & Safety Emergency Exception)
  saveCrisisIncident(incident: {
    collegeId: string;
    courseId: string;
    studentId: string;
    category: string;
    triggerSnippet: string;
    responseRendered: string;
  }): Promise<import('./crisis-alert.port.js').CrisisIncident>;
  listCrisisIncidents(collegeId: string): Promise<import('./crisis-alert.port.js').CrisisIncident[]>;

  clearUserData(userId: string): Promise<void>;
}
