import { describe, it, expect } from 'vitest';
import { VirtualTaEngine } from './virtual-ta-engine.js';
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
  ScaffoldingState,
} from '../index.js';

class MockLlm implements LlmPort {
  readonly providerName = 'mock-llm';
  public streamResponses: StreamEvent[][] = [];
  public generateResponses: string[] = [];
  public recordedOptions: Array<{
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
    toolNames: string[];
    reasoning?: string;
  }> = [];
  public currentStreamIndex = 0;

  getCapabilities() {
    return {
      streaming: true,
      parallelToolCalls: true,
      reasoning: true,
      maxContextTokens: 100000,
      structuredOutput: true,
      supportsPromptCaching: false,
    };
  }

  async generate() {
    const nextText = this.generateResponses.shift() ?? 'course_material';
    return { text: nextText };
  }

  async *stream(options: {
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
    tools?: Array<{ name: string }>;
    reasoning?: string;
  }) {
    this.recordedOptions.push({
      systemPrompt: options.systemPrompt,
      messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
      toolNames: (options.tools || []).map((t) => t.name),
      reasoning: options.reasoning,
    });
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
  async saveMessage(params: any): Promise<Message> {
    const msg: Message = {
      id: `msg_${Date.now()}_${Math.random()}`,
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      citations: params.citations || [],
      isCrisis: params.isCrisis || undefined,
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
      assistantRole: isInstructor ? 'instructor' : 'student',
    };
  }
}

class MockModeration implements ModerationPort {
  public calls: Array<{ content: string; options: unknown }> = [];

  async checkContent(content: string, options?: unknown) {
    this.calls.push({ content, options });
    const isCrisis = content.toLowerCase().includes('end my life') || content.toLowerCase().includes('suicide');
    return {
      flagged: isCrisis,
      categories: isCrisis ? ['self-harm', 'crisis'] : [],
      crisisDetected: isCrisis,
      triggerSnippet: isCrisis ? 'end my life' : undefined,
      reason: isCrisis ? 'Detected crisis intent' : undefined,
      stage: isCrisis ? ('lexical' as const) : ('none' as const),
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
    assistantName: 'SDI Virtual TA',
    greetingStudent: 'Hello!',
    greetingInstructor: 'Hello Instructor!',
  },
};

describe('VirtualTaEngine Comprehensive Suite', () => {
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

    const engine = new VirtualTaEngine({
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

    // Verify events sequence & sanitized SSE tool-status output
    const textDeltas = events.filter((e) => e.type === 'text-delta').map((e) => (e as any).delta).join('');
    expect(textDeltas).toContain('Let me look that up.');
    expect(textDeltas).toContain('Safety Lab 1 is due Sunday');

    const toolCallingEv = events.find(
      (e) => e.type === 'tool-status' && (e as any).status === 'calling',
    ) as any;
    expect(toolCallingEv).toBeDefined();
    expect(toolCallingEv.args).toBeUndefined();
    expect(toolCallingEv.callId).toBeUndefined();
    expect(toolCallingEv.thoughtSignature).toBeUndefined();

    // Verify LMS tool results are wrapped in untrusted_canvas_data delimiters
    const round2Messages = llm.recordedOptions[1].messages;
    const toolMessages = round2Messages.filter((m) => m.role === 'tool');
    expect(toolMessages[0].content).toContain('<untrusted_canvas_data tool="get_syllabus">');
    expect(toolMessages[0].content).toContain('Syllabus content here');

    // Verify absolute Canvas URLs on citations
    const citations = events.filter((e) => e.type === 'citation');
    expect(citations.length).toBe(2);
    expect((citations[0] as any).citation.type).toBe('syllabus');
    expect((citations[0] as any).citation.url).toBe('https://sdi.edu/courses/sdi-ftt101/syllabus');
    expect((citations[1] as any).citation.type).toBe('assignment');
    expect((citations[1] as any).citation.url).toBe(
      'https://sdi.edu/courses/sdi-ftt101/assignments/lab-1',
    );

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect((doneEvent as any).conversationId).toBeDefined();

    // Verify telemetry logged
    expect(telemetry.loggedMetrics.length).toBeGreaterThan(0);
  });

  it('handles safety crisis escalation with typed CrisisEvent, saves isCrisis, and logs emergency record', async () => {
    const llm = new MockLlm();
    const persistence = new MockPersistence();
    const identity = new MockIdentity();
    const telemetry = new MockTelemetry();
    const toolRegistry = new ToolRegistry();

    const engine = new VirtualTaEngine({
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

    const crisisEvent = events.find((e) => e.type === 'crisis') as any;
    expect(crisisEvent).toBeDefined();
    expect(crisisEvent.phone).toBe('988');
    expect(crisisEvent.url).toBe('https://988lifeline.org');

    const text = events.filter((e) => e.type === 'text-delta').map((e) => (e as any).delta).join('');
    expect(text).toContain('988 Suicide & Crisis Lifeline');
    expect(text).toContain('free, confidential support available 24/7');

    const savedMsgs = Array.from(persistence.messages.values())[0];
    expect(savedMsgs[1].isCrisis).toBe(true);

    expect(persistence.crisisIncidents.length).toBe(1);
    expect(persistence.crisisIncidents[0].triggerSnippet).toBe('end my life');
  });

  it('executes instructor turn using instructorLlm with direct response', async () => {
    const studentLlm = new MockLlm();
    const instructorLlm = new MockLlm();
    const persistence = new MockPersistence();
    const identity = new MockIdentity();
    const telemetry = new MockTelemetry();
    const toolRegistry = new ToolRegistry();

    // Register a tool allowed for instructor and an unlisted extra tool to verify profile allowlist filtering
    toolRegistry.register({
      name: 'get_assignments_without_due_dates',
      description: 'Find assignments without due dates',
      parameters: z.object({}),
      requiredRole: 'instructor',
      requiredScopes: [],
      execute: async () => [],
    });
    toolRegistry.register({
      name: 'unlisted_instructor_tool',
      description: 'Not in harness profile allowlist',
      parameters: z.object({}),
      requiredRole: 'instructor',
      requiredScopes: [],
      execute: async () => 'blocked',
    });

    // Set course setting to logistics_only (instructor should still have full instructor tools & pageContext)
    await persistence.updateCourseSettings('sdi-ftt101', 'logistics_only');

    instructorLlm.streamResponses = [
      [{ type: 'text-delta', delta: 'Here is the summary of submissions for Lab 1.' }],
    ];

    const engine = new VirtualTaEngine({
      llm: studentLlm,
      instructorLlm,
      persistence,
      toolRegistry,
      identity,
      telemetry,
      collegeConfig: mockCollege,
      canvasBaseUrl: 'https://classroom.sdi.edu',
      moderation: new MockModeration() as any,
      lms: new MockLms() as any,
      calculator: new MockCalculator() as any,
    });

    const events: StreamEvent[] = [];
    for await (const ev of engine.executeTurn({
      personaId: 'demo_instructor',
      message: 'Summarize submissions for Lab 1',
      courseId: 'sdi-ftt101',
      pageContext: {
        title: 'Safety Lab 1',
        url: 'https://classroom.sdi.edu/courses/101/assignments/1',
        content: 'Inspect bench safety gear.',
      },
    })) {
      events.push(ev);
    }

    expect(studentLlm.recordedOptions).toHaveLength(0);
    expect(instructorLlm.recordedOptions).toHaveLength(1);
    expect(instructorLlm.recordedOptions[0].toolNames).toContain('get_assignments_without_due_dates');
    expect(instructorLlm.recordedOptions[0].toolNames).not.toContain('unlisted_instructor_tool');
    expect(instructorLlm.recordedOptions[0].systemPrompt).toContain('<untrusted_canvas_data source="current_page">');

    const text = events.filter((e) => e.type === 'text-delta').map((e) => (e as any).delta).join('');
    expect(text).toContain('Here is the summary of submissions for Lab 1.');
    expect(telemetry.loggedMetrics.length).toBeGreaterThan(0);
  });

  it('injects pageContext in full mode, strips it in logistics_only, and validates page/announcement/module citations', async () => {
    const llm = new MockLlm();
    const persistence = new MockPersistence();
    const identity = new MockIdentity();
    const telemetry = new MockTelemetry();
    const toolRegistry = new ToolRegistry();

    for (const [name, schemaObj] of [
      ['get_course_page', z.object({ pageUrl: z.string() })],
      ['get_announcements', z.object({})],
      ['get_course_modules', z.object({})],
      ['calculate', z.object({ expression: z.string() })],
    ] as Array<[string, z.ZodTypeAny]>) {
      toolRegistry.register({
        name,
        description: name,
        parameters: schemaObj,
        requiredRole: 'both',
        requiredScopes: [],
        execute: async () => {
          if (name === 'get_announcements') {
            throw new Error('Canvas unavailable');
          }
          return `${name}_ok`;
        },
      });
    }

    llm.streamResponses = [
      [
        {
          type: 'tool-status',
          toolName: 'get_course_page',
          status: 'calling',
          callId: 'c_page',
          args: { pageUrl: 'welcome-to-sdi' },
        },
        {
          type: 'tool-status',
          toolName: 'get_course_modules',
          status: 'calling',
          callId: 'c_mod',
          args: {},
        },
        {
          type: 'tool-status',
          toolName: 'get_announcements',
          status: 'calling',
          callId: 'c_ann',
          args: {},
        },
        {
          type: 'tool-status',
          toolName: 'calculate',
          status: 'calling',
          callId: 'c_calc',
          args: { expression: '2+2' },
        },
      ],
      [{ type: 'text-delta', delta: 'Done checking pages and modules.' }],
      [{ type: 'text-delta', delta: 'Due Sunday.' }],
    ];

    const engine = new VirtualTaEngine({
      llm,
      classifierLlm: llm,
      persistence,
      toolRegistry,
      identity,
      telemetry,
      collegeConfig: mockCollege,
      canvasBaseUrl: 'https://classroom.sdi.edu/',
      moderation: new MockModeration() as any,
      lms: new MockLms() as any,
      calculator: new MockCalculator() as any,
    });

    const events: StreamEvent[] = [];
    for await (const ev of engine.executeTurn({
      personaId: 'demo_student',
      message: 'Help me with this page',
      courseId: 'sdi-ftt101',
      pageContext: {
        title: 'Welcome to SDI',
        content: 'Firearm safety basics page text.',
      },
    })) {
      events.push(ev);
    }

    expect(llm.recordedOptions[0].systemPrompt).toContain('<untrusted_canvas_data source="current_page">');
    expect(llm.recordedOptions[0].systemPrompt).toContain('Firearm safety basics page text.');

    // Calculator tool output should NOT be wrapped as untrusted_canvas_data, whereas LMS tools ARE wrapped
    const toolMsgs = llm.recordedOptions[1].messages.filter((m) => m.role === 'tool');
    expect(toolMsgs[0].content).toContain('<untrusted_canvas_data tool="get_course_page">');
    expect(toolMsgs[3].content).toBe('calculate_ok');

    // Citations emitted for get_course_page and get_course_modules, suppressed for failed get_announcements
    const citeUrls = events.filter((e) => e.type === 'citation').map((e) => (e as any).citation.url);
    expect(citeUrls).toContain('https://classroom.sdi.edu/courses/sdi-ftt101/pages/welcome-to-sdi');
    expect(citeUrls).toContain('https://classroom.sdi.edu/courses/sdi-ftt101/modules');
    expect(citeUrls.some((u: string) => u.includes('announcements'))).toBe(false);

    // Under logistics_only, pageContext MUST be stripped even on an allowed logistics turn
    await persistence.updateCourseSettings('sdi-ftt101', 'logistics_only');
    for await (const _ev of engine.executeTurn({
      personaId: 'demo_student',
      message: 'When is Lab 1 due?',
      courseId: 'sdi-ftt101',
      pageContext: {
        title: 'Hidden Exam Page',
        content: 'Secret course material content',
      },
    })) {
      // consume
    }
    const logisticsPrompt = llm.recordedOptions[2].systemPrompt;
    expect(logisticsPrompt).not.toContain('Secret course material content');
    expect(logisticsPrompt).not.toContain('<untrusted_canvas_data source="current_page">');
  });

  it('rejects IDOR attempt when resuming another user conversation and handles blended queries', async () => {
    const llm = new MockLlm();
    const persistence = new MockPersistence();
    const identity = new MockIdentity();
    const telemetry = new MockTelemetry();
    const toolRegistry = new ToolRegistry();

    const instructorConv = await persistence.createConversation({
      collegeId: 'sdi',
      courseId: 'sdi-ftt101',
      userId: 'demo_instructor',
      role: 'instructor',
    });

    const engine = new VirtualTaEngine({
      llm,
      classifierLlm: llm,
      persistence,
      toolRegistry,
      identity,
      telemetry,
      collegeConfig: mockCollege,
      moderation: new MockModeration() as any,
      lms: new MockLms() as any,
      calculator: new MockCalculator() as any,
    });

    const consume = async () => {
      for await (const _ev of engine.executeTurn({
        personaId: 'demo_student',
        courseId: 'sdi-ftt101',
        conversationId: instructorConv.id,
        message: 'Show instructor conversation',
      })) {
        // no-op
      }
    };

    await expect(consume()).rejects.toThrow('Unauthorized');

    // Blended query (contains both logistics & course material) delegates to classifierLlm / fail-safes to course_material
    llm.generateResponses.push('course_material');
    const res = await engine.classifyQuestion('How do I solve problem 2 before the due date?');
    expect(res).toBe('course_material');
  });

  it('escalates stateful hint ladder across turns, passes prior history to moderation, forwards reasoning, and strips internal usage chunks', async () => {
    const llm = new MockLlm();
    const persistence = new MockPersistence();
    const identity = new MockIdentity();
    const moderation = new MockModeration();
    const telemetry = new MockTelemetry();
    const toolRegistry = new ToolRegistry();

    llm.streamResponses = [
      [
        { type: 'text-delta', delta: 'What formula relates twist rate and bullet length?' },
        { type: 'usage', promptTokens: 100, completionTokens: 15, totalTokens: 115 },
      ],
      [
        { type: 'text-delta', delta: 'Lab 1 is due Sunday.' },
        { type: 'usage', promptTokens: 120, completionTokens: 8, totalTokens: 128 },
      ],
      [
        { type: 'text-delta', delta: 'Think about Greenhill: twist = 150 * D^2 / L.' },
        { type: 'usage', promptTokens: 160, completionTokens: 20, totalTokens: 180 },
      ],
      [
        { type: 'text-delta', delta: 'Step 1: square the diameter in inches before multiplying by 150.' },
        { type: 'usage', promptTokens: 200, completionTokens: 25, totalTokens: 225 },
      ],
    ];

    const engine = new VirtualTaEngine({
      llm,
      persistence,
      toolRegistry,
      identity,
      telemetry,
      collegeConfig: mockCollege,
      moderation: moderation as any,
      lms: new MockLms() as any,
      calculator: new MockCalculator() as any,
    });

    const collectTurn = async (message: string, conversationId?: string) => {
      const events: StreamEvent[] = [];
      let resolvedConvId = conversationId;
      for await (const ev of engine.executeTurn({
        personaId: 'demo_student',
        courseId: 'sdi-ftt101',
        conversationId,
        message,
      })) {
        events.push(ev);
        if (ev.type === 'done') {
          resolvedConvId = ev.conversationId;
        }
      }
      return { events, conversationId: resolvedConvId! };
    };

    // Turn 1: Initial course material question -> Level 1
    const turn1 = await collectTurn('How do I calculate rifling twist rate using barrel diameter?');
    expect(turn1.events.some((e) => e.type === 'usage')).toBe(false);
    expect(llm.recordedOptions[0].reasoning).toBe('minimal');
    expect(llm.recordedOptions[0].systemPrompt).toContain('Current Hint Level: 1/3');
    expect((await persistence.getConversation(turn1.conversationId))?.scaffoldingState?.hintLevel).toBe(1);

    // Turn 2: Logistics interruption -> preserves Level 1
    const turn2 = await collectTurn('When is the lab due?', turn1.conversationId);
    expect((await persistence.getConversation(turn2.conversationId))?.scaffoldingState?.hintLevel).toBe(1);
    expect(llm.recordedOptions[1].systemPrompt).toContain('Current Hint Level: 1/3');

    // Turn 3: Student struggle -> escalates to Level 2 + moderation receives prior history
    const turn3 = await collectTurn('I am still stuck on rifling twist rate', turn1.conversationId);
    expect((await persistence.getConversation(turn3.conversationId))?.scaffoldingState?.hintLevel).toBe(2);
    expect(llm.recordedOptions[2].systemPrompt).toContain('Current Hint Level: 2/3');
    expect((moderation.calls[2].options as any).recentMessages.length).toBeGreaterThanOrEqual(4);

    // Turn 4: Continued struggle -> escalates to Level 3
    await collectTurn('I still do not get what number goes in the numerator', turn1.conversationId);
    expect((await persistence.getConversation(turn1.conversationId))?.scaffoldingState?.hintLevel).toBe(3);
    expect(llm.recordedOptions[3].systemPrompt).toContain('Current Hint Level: 3/3');

    // Verify telemetry recorded tokens, TTFT, and hintLevel
    const completedEvents = telemetry.loggedEvents.filter((e) => e.name === 'turn_completed');
    expect(completedEvents[3].properties.totalTokens).toBe(225);
    expect(completedEvents[3].properties.hintLevel).toBe(3);
    expect(typeof completedEvents[3].properties.ttftMs).toBe('number');
    expect(telemetry.loggedMetrics.some((m) => m.name === 'llm_tokens_total')).toBe(true);
    expect(telemetry.loggedMetrics.some((m) => m.name === 'turn_ttft_ms')).toBe(true);
  });
});
