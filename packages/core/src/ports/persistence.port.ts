import {
  User,
  Course,
  CourseSettings,
  CourseSettingValue,
  Conversation,
  Message,
  MessageRole,
  Citation,
  AssistantRole,
} from '../types/index.js';
import { ScaffoldingState } from '../policy/hint-ladder.js';
import { CrisisIncident, CrisisIncidentStatus } from './crisis-alert.port.js';

export interface ConfusionPulseTopic {
  topic: string;
  count: number;
}

export interface ConfusionPulseResult {
  thresholdMet: boolean;
  distinctStudents: number;
  minThreshold: number;
  topics: ConfusionPulseTopic[];
}

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
  updateCourseSettings(
    courseId: string,
    setting: CourseSettingValue,
    options?: { blackoutStart?: Date | null; blackoutEnd?: Date | null },
  ): Promise<CourseSettings>;

  createConversation(params: {
    collegeId: string;
    courseId: string;
    userId: string;
    role: AssistantRole;
  }): Promise<Conversation>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  listConversations(userId: string, courseId: string): Promise<Conversation[]>;
  deleteConversation(conversationId: string, userId: string): Promise<boolean>;
  updateConversationScaffoldingState(
    conversationId: string,
    scaffoldingState: ScaffoldingState,
  ): Promise<Conversation | null>;

  getConfusionPulse(courseId: string, minDistinctUsers?: number): Promise<ConfusionPulseResult>;

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
  }): Promise<CrisisIncident>;
  listCrisisIncidents(collegeId: string): Promise<CrisisIncident[]>;
  updateCrisisIncidentStatus(
    incidentId: string,
    status: CrisisIncidentStatus,
    reviewedBy: string,
  ): Promise<CrisisIncident | null>;

  clearUserData(userId: string): Promise<void>;

  purgeExpiredConversations(
    retentionDays: number,
    now?: Date,
  ): Promise<{ deletedConversations: number; deletedMessages: number }>;
}
