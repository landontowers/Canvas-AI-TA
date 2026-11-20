import { describe, it, expect } from 'vitest';
import { TutorEngine } from './tutor-engine.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { CoreTool } from '../tools/tool.types.js';
import { z } from 'zod';
import {
  LlmPort,
  PersistencePort,
  IdentityPort,
  ModerationPort,
  TelemetryPort,
  AuthUserContext,
  CollegeConfig,
  StreamEvent,
  Conversation,
  Message,
  User,
  Course,
  CourseSettings,
  CourseSettingValue,
  CollegeRecord,
  CrisisIncident,
} from '../index.js';

class MockLlm implements LlmPort {
  readonly providerName = 'mock-llm';
  public streamResponses: StreamEvent[][] = [];
  public currentStreamIndex = 0;

  getCapabilities() {
    return {
      streaming: true,
      parallelToolCalls: true,
      reasoning: false,
      maxContextTokens: 100000,
      structuredOutput: true,
      supportsPromptCaching: false,
    };
  }

  async generate() {
    return { text: 'Mock generate response' };
  }

  async *stream() {
    const streamToYield = this.streamResponses[this.currentStreamIndex] || [
      { type: 'text-delta', delta: 'Default LLM answer' },
    ];
    this.currentStreamIndex++;
    for (const event of streamToYield) {
      yield event;
    }
  }
}

class MockPersistence implements PersistencePort {
  public conversations = new Map<string, Conversation>();
  public messages = new Map<string, Message[]>();
  public settings = new Map<string, CourseSettings>();
  public crisisIncidents: CrisisIncident[] = [];

  async getCollege(): Promise<CollegeRecord | null> {
    return { id: 'sdi', name: 'Sonoran Desert Institute', domain: 'sdi.edu', createdAt: new Date() };
  }
  async upsertCollege(c: CollegeRecord) { return c; }
  async getUser(id: string): Promise<User | null> {
    return { id, collegeId: 'sdi', externalCanvasId: 'canvas_1', role: 'student', createdAt: new Date() };
  }
  async getUserByExternalCanvasId(): Promise<User | null> { return null; }
  async upsertUser(u: any): Promise<User> {
    return { id: u.id || 'usr_1', collegeId: 'sdi', externalCanvasId: 'canvas_1', role: u.role || 'student', createdAt: new Date() };
  }
  async getCourse(id: string): Promise<Course | null> {
    return { id, collegeId: 'sdi', externalCanvasId: 'canvas_c1', name: 'Test Course', courseCode: 'FTT101', createdAt: new Date() };
  }
  async upsertCourse(c: Course) { return c; }
  async getCourseSettings(courseId: string): Promise<CourseSettings> {
    return this.settings.get(courseId) || {
      courseId,
      setting: 'full',
      updatedAt: new Date(),
    };
  }
  async updateCourseSettings(courseId: string, setting: CourseSettingValue): Promise<CourseSettings> {
    const s: CourseSettings = { courseId, setting, updatedAt: new Date() };
    this.settings.set(courseId, s);
    return s;
  }
  async getConversation(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) || null;
  }
  async createConversation(params: any): Promise<Conversation> {
    const conv: Conversation = {
      id: params.id || `conv_${Date.now()}_${Math.random()}`,
      collegeId: params.collegeId,
      courseId: params.courseId,
      userId: params.userId,
      role: params.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.conversations.set(conv.id, conv);
    return conv;
  }
  async getOrCreateConversation(params: any): Promise<Conversation> {
    if (params.id && this.conversations.has(params.id)) {
      return this.conversations.get(params.id)!;
    }
    return this.createConversation(params);
  }
  async listConversations(params: any): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).filter((c) => c.userId === params.userId);
  }
  async saveMessage(params: any): Promise<Message> {
    const msg: Message = {
      id: `msg_${Date.now()}_${Math.random()}`,
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      citations: params.citations || [],
      createdAt: new Date(),
    };
    const list = this.messages.get(params.conversationId) || [];
    list.push(msg);
    this.messages.set(params.conversationId, list);
    return msg;
  }
  async getMessages(conversationId: string): Promise<Message[]> {
    return this.messages.get(conversationId) || [];
  }
  async listMessages(conversationId: string): Promise<Message[]> {
    return this.getMessages(conversationId);
  }
  async clearUserData(userId: string): Promise<void> {
    for (const [id, c] of this.conversations.entries()) {
      if (c.userId === userId) {
        this.messages.delete(id);
        this.conversations.delete(id);
      }
    }
  }
  async resetDemo(courseId = 'sdi-ftt101'): Promise<void> {
    this.messages.clear();
    this.conversations.clear();
    this.settings.set(courseId, { courseId, setting: 'full', updatedAt: new Date() });
  }
  async saveCrisisIncident(incident: any) {
    const inc = { ...incident, id: `inc_${Date.now()}`, createdAt: new Date() };
    this.crisisIncidents.push(inc);
    return inc;
  }
  async listCrisisIncidents() {
    return this.crisisIncidents;
  }
}

class MockIdentity implements IdentityPort {
  async resolveIdentity(params: any): Promise<AuthUserContext> {
    const isInstructor = params.personaId === 'demo_instructor';
    return {
      userId: params.personaId || 'demo_student',
      canvasUserId: '1001',
      collegeId: 'sdi',
      courseId: params.courseId || 'sdi-ftt101',
      roles: [isInstructor ? 'TeacherEnrollment' : 'StudentEnrollment'],
      tutorRole: isInstructor ? 'instructor' : 'student',
    };
  }
}

class MockModeration implements ModerationPort {
  async checkContent(content: string) {
    const isCrisis = content.toLowerCase().includes('end my life') || content.toLowerCase().includes('suicide');
    return {
      flagged: isCrisis,
      categories: isCrisis ? ['self-harm', 'crisis'] : [],
      crisisDetected: isCrisis,
      triggerSnippet: isCrisis ? 'end my life' : undefined,
      reason: isCrisis ? 'Detected crisis intent' : undefined,
    };
  }
}

class MockLms {
  async getCourse() { return null; }
  async getAssignment() { return null; }
  async getSyllabus() { return 'Syllabus'; }
}

class MockCalculator {
  async calculate(expr: string) { return { result: '4', expression: expr }; }
}

class MockTelemetry implements TelemetryPort {
  public loggedEvents: any[] = [];
  public loggedMetrics: any[] = [];

  recordEvent(name: string, properties?: any) {
    this.loggedEvents.push({ name, properties });
  }
  recordMetric(name: string, value: number, tags?: any) {
    this.loggedMetrics.push({ name, value, tags });
  }
}

const mockCollege: CollegeConfig = {
  id: 'sdi',
  name: 'Sonoran Desert Institute',
  domain: 'sdi.edu',
  defaultCourseSetting: 'full',
  crisis: {
    hotlineName: '988 Suicide & Crisis Lifeline',
    message: 'If you or someone you know is going through a tough time, the 988 Suicide & Crisis Lifeline provides free, confidential support available 24/7.',
    phone: '988',
    sms: '988',
    url: 'https://988lifeline.org',
  },
  theme: {
    brandColor: '#D50032',
    primaryActionColor: '#005696',
    surfaceColor: '#FFFFFF',
    fontBody: 'sans-serif',
    fontDisplay: 'sans-serif',
  },
  personaCopy: {
    tutorName: 'SDI AI Tutor',
    greetingStudent: 'Hello!',
    greetingInstructor: 'Hello Instructor!',
  },
};

describe('TutorEngine Comprehensive Suite', () => {
  it('executes student turn, handles tool call, attaches citations, and yields response', async () => {
    const llm = new MockLlm();
    const persistence = new MockPersistence();
    const identity = new MockIdentity();
    const telemetry = new MockTelemetry();
    const toolRegistry = new ToolRegistry();

    // Register test tool that calls get_syllabus and get_assignment_details
    const syllabusTool: CoreTool<{ dummy?: string }, string> = {
      name: 'get_syllabus',
      description: 'Fetch syllabus',
      parameters: z.object({ dummy: z.string().optional() }),
      requiredRole: 'both',
      requiredScopes: [],
      execute: async () => 'Syllabus content here',
    };
    toolRegistry.register(syllabusTool);

    const assignmentTool: CoreTool<{ assignmentId: string }, string> = {
      name: 'get_assignment_details',
      description: 'Fetch assignment',
      parameters: z.object({ assignmentId: z.string() }),
      requiredRole: 'both',
      requiredScopes: [],
      execute: async (args) => `Details for ${args.assignmentId}`,
    };
    toolRegistry.register(assignmentTool);

    // Multi-turn stream: first turn triggers tools, second turn returns text
    llm.streamResponses = [
      [
        { type: 'text-delta', delta: 'Let me look that up. ' },
        {
          type: 'tool-status',
          toolName: 'get_syllabus',
          status: 'calling',
          callId: 'call_syl_1',
          args: {},
        },
        {
          type: 'tool-status',
          toolName: 'get_assignment_details',
          status: 'calling',
          callId: 'call_asg_1',
          args: { assignmentId: 'lab-1' },
        },
      ],
      [
        { type: 'text-delta', delta: 'Safety Lab 1 is due Sunday at 11:59 PM per the syllabus.' },
      ],
    ];

    const engine = new TutorEngine({
      llm,
      persistence,
      toolRegistry,
      identity,
      telemetry,
      collegeConfig: mockCollege,
      moderation: new MockModeration() as any,
      lms: new MockLms() as any,
      calculator: new MockCalculator() as any,
    });

    const events: StreamEvent[] = [];
    for await (const ev of engine.executeTurn({
      personaId: 'demo_student',
      message: 'When is Safety Lab 1 due?',
      courseId: 'sdi-ftt101',
    })) {
      events.push(ev);
    }

    // Verify events sequence
    const textDeltas = events.filter((e) => e.type === 'text-delta').map((e) => (e as any).delta).join('');
    expect(textDeltas).toContain('Let me look that up.');
    expect(textDeltas).toContain('Safety Lab 1 is due Sunday');

    const citations = events.filter((e) => e.type === 'citation');
    expect(citations.length).toBe(2);
    expect((citations[0] as any).citation.type).toBe('syllabus');
    expect((citations[1] as any).citation.type).toBe('assignment');

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect((doneEvent as any).conversationId).toBeDefined();

    // Verify telemetry logged
    expect(telemetry.loggedMetrics.length).toBeGreaterThan(0);
  });

  it('handles safety crisis escalation immediately and logs emergency record', async () => {
    const llm = new MockLlm();
    const persistence = new MockPersistence();
    const identity = new MockIdentity();
    const telemetry = new MockTelemetry();
    const toolRegistry = new ToolRegistry();

    const engine = new TutorEngine({
      llm,
      persistence,
      toolRegistry,
      identity,
      telemetry,
      collegeConfig: mockCollege,
      moderation: new MockModeration() as any,
      lms: new MockLms() as any,
      calculator: new MockCalculator() as any,
    });

    const events: StreamEvent[] = [];
    for await (const ev of engine.executeTurn({
      personaId: 'demo_student',
      message: 'I want to end my life, please help me',
      courseId: 'sdi-ftt101',
    })) {
      events.push(ev);
    }

    const text = events.filter((e) => e.type === 'text-delta').map((e) => (e as any).delta).join('');
    expect(text).toContain('988 Suicide & Crisis Lifeline');
    expect(text).toContain('free, confidential support available 24/7');

    expect(persistence.crisisIncidents.length).toBe(1);
    expect(persistence.crisisIncidents[0].triggerSnippet).toBe('end my life');
  });

  it('executes instructor turn with direct response and logistics_only enforcement', async () => {
    const llm = new MockLlm();
    const persistence = new MockPersistence();
    const identity = new MockIdentity();
    const telemetry = new MockTelemetry();
    const toolRegistry = new ToolRegistry();

    // Set course setting to logistics_only
    await persistence.updateCourseSettings('sdi-ftt101', 'logistics_only');

    llm.streamResponses = [
      [{ type: 'text-delta', delta: 'Here is the summary of submissions for Lab 1.' }],
    ];

    const engine = new TutorEngine({
      llm,
      persistence,
      toolRegistry,
      identity,
      telemetry,
      collegeConfig: mockCollege,
      moderation: new MockModeration() as any,
      lms: new MockLms() as any,
      calculator: new MockCalculator() as any,
    });

    const events: StreamEvent[] = [];
    for await (const ev of engine.executeTurn({
      personaId: 'demo_instructor',
      message: 'Summarize submissions for Lab 1',
      courseId: 'sdi-ftt101',
    })) {
      events.push(ev);
    }

    const text = events.filter((e) => e.type === 'text-delta').map((e) => (e as any).delta).join('');
    expect(text).toContain('Here is the summary of submissions for Lab 1.');
    expect(telemetry.loggedMetrics.length).toBeGreaterThan(0);
  });
});
