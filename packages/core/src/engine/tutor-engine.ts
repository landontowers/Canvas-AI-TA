import {
  LlmPort,
  LmsPort,
  IdentityPort,
  PersistencePort,
  CalculatorPort,
  ModerationPort,
  TelemetryPort,
  CourseContentPort,
  CrisisAlertPort,
} from '../ports/index.js';
import { StreamEvent, toClientStreamEvent } from '../types/stream.js';
import { Citation, MessageRole } from '../types/message.js';
import { ToolCall, ToolDefinition, ToolResult } from '../types/tool.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { ToolExecutionContext } from '../tools/tool.types.js';
import { HarnessProfile, STUDENT_HARNESS_PROFILE } from '../profiles/student.profile.js';
import { INSTRUCTOR_HARNESS_PROFILE } from '../profiles/instructor.profile.js';
import { evaluateStudentPolicy, QuestionClassification } from '../policy/classifier.js';
import { CollegeConfig } from '../config/schema.js';
import { CourseSettingValue } from '../types/course.js';
import { TutorRole } from '../types/role.js';

export interface TutorEngineDependencies {
  llm: LlmPort;
  instructorLlm?: LlmPort;
  classifierLlm?: LlmPort;
  lms: LmsPort;
  identity: IdentityPort;
  persistence: PersistencePort;
  calculator: CalculatorPort;
  moderation: ModerationPort;
  telemetry: TelemetryPort;
  toolRegistry: ToolRegistry;
  collegeConfig: CollegeConfig;
  canvasBaseUrl?: string;
  courseContent?: CourseContentPort;
  crisisAlert?: CrisisAlertPort;
}

export interface PageContext {
  title?: string;
  url?: string;
  content?: string;
}

export interface TurnParameters {
  personaId?: string;
  courseId?: string;
  conversationId?: string;
  message: string;
  pageContext?: PageContext;
}

const MAX_PAGE_CONTENT_CHARS = 4000;
const PURE_CALCULATION_TOOLS = new Set(['calculate', 'date_math']);

export class TutorEngine {
  constructor(private deps: TutorEngineDependencies) {}

  /**
   * Helper classifier for student questions (critique §3.4).
   * Determines if a question is purely about logistics (grades, deadlines, requirements, syllabus)
   * or course subject matter (how to solve problems, theory, concepts).
   */
  async classifyQuestion(message: string): Promise<QuestionClassification> {
    const lower = message.toLowerCase();

    // Fast heuristic keywords for common logistics questions
    const logisticsKeywords = [
      'due date',
      'due',
      'deadline',
      'grade',
      'score',
      'syllabus',
      'announcement',
      'office hour',
      'policy',
      'submit',
      'late penalty',
      'what is assignment',
      'when is',
      'how many points',
    ];

    const isLogistics = logisticsKeywords.some((kw) => lower.includes(kw));

    const courseMaterialKeywords = [
      'how do i solve',
      'solve this',
      'answer to question',
      'explain the difference between',
      'how does the mechanism work',
      'why does',
      'write code',
      'calculate tolerance for',
      'what is the formula for',
      'solution for',
    ];

    const isCourseMaterial = courseMaterialKeywords.some((kw) => lower.includes(kw));

    // Clear single-category matches
    if (isCourseMaterial && !isLogistics) {
      return 'course_material';
    }

    if (isLogistics && !isCourseMaterial) {
      return 'logistics';
    }

    // If both match (blended query) or neither matches (grey zone), invoke classifier LLM if available
    if (this.deps.classifierLlm) {
      try {
        const response = await this.deps.classifierLlm.generate({
          systemPrompt:
            'You are a strict academic policy classifier. Classify the user question as either "logistics" (deadlines, grades, policies, submission requirements, syllabus) or "course_material" (problem solving, subject theory, homework answers, concept explanations). If the user asks how to solve or answer a question—even if they mention a deadline or submission—classify it as "course_material". Respond with only "logistics" or "course_material".',
          messages: [{ role: 'user', content: message }],
          maxTokens: 10,
        });
        const text = response.text.trim().toLowerCase();
        if (text.includes('course_material')) return 'course_material';
        if (text.includes('logistics')) return 'logistics';
      } catch {
        // Fallback to default
      }
    }

    // Fail-safe default under conflict or unknown: protect course material
    return 'course_material';
  }

  private buildSystemPrompt(
    profile: HarnessProfile,
    role: TutorRole,
    courseSetting: CourseSettingValue,
    pageContext?: PageContext,
  ): string {
    if (!pageContext || (role === 'student' && courseSetting === 'logistics_only')) {
      return profile.systemPrompt;
    }

    const parts: string[] = [];
    if (pageContext.title) parts.push(`Title: ${pageContext.title}`);
    if (pageContext.url) parts.push(`URL: ${pageContext.url}`);
    if (pageContext.content) {
      const truncated =
        pageContext.content.length > MAX_PAGE_CONTENT_CHARS
          ? `${pageContext.content.slice(0, MAX_PAGE_CONTENT_CHARS)}\n...[truncated]`
          : pageContext.content;
      parts.push(`Content:\n${truncated}`);
    }

    if (parts.length === 0) {
      return profile.systemPrompt;
    }

    return `${profile.systemPrompt}\n\nThe user is currently viewing the following Canvas page:\n<untrusted_canvas_data source="current_page">\n${parts.join('\n')}\n</untrusted_canvas_data>`;
  }

  private getPermittedTools(
    profile: HarnessProfile,
    role: TutorRole,
    courseSetting: CourseSettingValue,
  ): ToolDefinition[] {
    const allowedSet = new Set(profile.allowedToolNames);
    let available = this.deps.toolRegistry
      .getToolsForRole(role)
      .filter((t) => allowedSet.has(t.name));

    if (role === 'student' && courseSetting === 'logistics_only') {
      available = available.filter(
        (t) =>
          t.name !== 'get_course_page' &&
          t.name !== 'get_course_modules' &&
          t.name !== 'get_assignment_details',
      );
    }

    return available;
  }

  private wrapToolOutput(toolName: string, rawContent: string): string {
    if (PURE_CALCULATION_TOOLS.has(toolName)) {
      return rawContent;
    }
    return `<untrusted_canvas_data tool="${toolName}">\n${rawContent}\n</untrusted_canvas_data>`;
  }

  private buildCitationForTool(
    call: ToolCall,
    courseId: string,
    isError: boolean,
  ): Citation | null {
    if (isError) return null;

    const canvasBase = (
      this.deps.canvasBaseUrl || `https://${this.deps.collegeConfig.domain}`
    ).replace(/\/+$/, '');
    const encodedCourseId = encodeURIComponent(courseId);

    switch (call.name) {
      case 'get_syllabus':
        return {
          title: 'Course Syllabus',
          url: `${canvasBase}/courses/${encodedCourseId}/syllabus`,
          type: 'syllabus',
        };
      case 'get_assignment_details':
        if (typeof call.args.assignmentId === 'string' && call.args.assignmentId.length > 0) {
          return {
            title: 'Assignment Details',
            url: `${canvasBase}/courses/${encodedCourseId}/assignments/${encodeURIComponent(call.args.assignmentId)}`,
            canvasId: call.args.assignmentId,
            type: 'assignment',
          };
        }
        return null;
      case 'get_course_page':
        if (typeof call.args.pageUrl === 'string' && call.args.pageUrl.length > 0) {
          return {
            title: 'Course Page',
            url: `${canvasBase}/courses/${encodedCourseId}/pages/${encodeURIComponent(call.args.pageUrl)}`,
            canvasId: call.args.pageUrl,
            type: 'page',
          };
        }
        return null;
      case 'get_announcements':
        return {
          title: 'Course Announcements',
          url: `${canvasBase}/courses/${encodedCourseId}/announcements`,
          type: 'announcement',
        };
      case 'get_course_modules':
        return {
          title: 'Course Modules',
          url: `${canvasBase}/courses/${encodedCourseId}/modules`,
          type: 'module',
        };
      default:
        return null;
    }
  }

  /**
   * Executes a full tutoring turn, streaming typed SSE events to the caller.
   */
  async *executeTurn(params: TurnParameters): AsyncIterable<StreamEvent> {
    const startTime = Date.now();

    // 1. Resolve identity and verify persona
    const authContext = await this.deps.identity.resolveIdentity({
      personaId: params.personaId,
      courseId: params.courseId,
    });

    // 2. Resolve or create conversation with strict ownership check (FERPA & IDOR defense)
    let conversation = null;
    if (params.conversationId) {
      const existing = await this.deps.persistence.getConversation(params.conversationId);
      if (existing) {
        if (existing.userId !== authContext.userId || existing.courseId !== authContext.courseId) {
          throw new Error('Unauthorized: Conversation does not belong to the authenticated user and course.');
        }
        conversation = existing;
      }
    }

    if (!conversation) {
      conversation = await this.deps.persistence.createConversation({
        collegeId: authContext.collegeId,
        courseId: authContext.courseId,
        userId: authContext.userId,
        role: authContext.tutorRole,
      });
    }

    // Save student/instructor user message
    await this.deps.persistence.saveMessage({
      conversationId: conversation.id,
      role: 'user',
      content: params.message,
    });

    // 3. Safety & Crisis check (critique §3.8, FERPA 34 CFR § 99.36)
    const moderation = await this.deps.moderation.checkContent(params.message, authContext.userId);
    if (moderation.crisisDetected) {
      const crisis = this.deps.collegeConfig.crisis;
      const crisisText = moderation.crisisMessage || crisis.message;

      yield {
        type: 'crisis',
        hotlineName: crisis.hotlineName,
        phone: crisis.phone,
        sms: crisis.sms,
        url: crisis.url,
        message: crisisText,
      };

      yield {
        type: 'text-delta',
        delta: crisisText,
      };

      const savedMsg = await this.deps.persistence.saveMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: crisisText,
        isCrisis: true,
      });

      yield {
        type: 'done',
        conversationId: conversation.id,
        messageId: savedMsg.id,
      };

      // Record emergency incident under FERPA Health & Safety exception (34 CFR § 99.36)
      const incident = await this.deps.persistence.saveCrisisIncident({
        collegeId: authContext.collegeId,
        courseId: authContext.courseId,
        studentId: authContext.userId,
        category: moderation.categories.join(','),
        triggerSnippet: moderation.triggerSnippet || moderation.reason || 'Safety filter triggered',
        responseRendered: crisisText,
      });

      // Dispatch alert to designated institutional contacts if alert adapter is wired
      if (this.deps.crisisAlert) {
        await this.deps.crisisAlert.dispatchAlert(incident).catch(() => {
          // Non-blocking catch to ensure student emergency assistance is never interrupted
        });
      }

      this.deps.telemetry.recordEvent('crisis_detected', {
        userId: authContext.userId,
        categories: moderation.categories.join(','),
        incidentId: incident.id,
      });
      return;
    }

    // 4. Role-based Profile, Single Course Settings Lookup, and Policy check
    const isStudent = authContext.tutorRole === 'student';
    const profile = isStudent ? STUDENT_HARNESS_PROFILE : INSTRUCTOR_HARNESS_PROFILE;
    const courseSettings = await this.deps.persistence.getCourseSettings(authContext.courseId);

    if (isStudent && courseSettings.setting === 'logistics_only') {
      const classification = await this.classifyQuestion(params.message);
      const policy = evaluateStudentPolicy(classification, 'logistics_only');

      if (!policy.allowed) {
        const refusal =
          policy.refusalMessage ||
          'Your instructor has configured this tutor for course logistics only. For questions regarding the course subject matter and assignments, please reach out directly to your instructor.';

        yield {
          type: 'text-delta',
          delta: refusal,
        };

        const savedMsg = await this.deps.persistence.saveMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: refusal,
        });

        yield {
          type: 'done',
          conversationId: conversation.id,
          messageId: savedMsg.id,
        };

        this.deps.telemetry.recordEvent('policy_refusal_logistics_only', {
          courseId: authContext.courseId,
          userId: authContext.userId,
        });
        return;
      }
    }

    // 5. Build tool list from profile allowlist + role boundary + logistics_only guard
    const availableTools = this.getPermittedTools(
      profile,
      authContext.tutorRole,
      courseSettings.setting,
    );

    const systemPrompt = this.buildSystemPrompt(
      profile,
      authContext.tutorRole,
      courseSettings.setting,
      params.pageContext,
    );
    const activeLlm = isStudent ? this.deps.llm : (this.deps.instructorLlm ?? this.deps.llm);

    // 6. Load conversation history
    const history = await this.deps.persistence.listMessages(conversation.id);
    const messagesForLlm: Array<{
      role: MessageRole;
      content: string;
      toolCalls?: ToolCall[];
      toolResultId?: string;
      toolName?: string;
    }> = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // 7. Tool execution loop (bounded to 3 rounds)
    const toolExecContext: ToolExecutionContext = {
      userId: authContext.userId,
      canvasUserId: authContext.canvasUserId,
      courseId: authContext.courseId,
      role: authContext.tutorRole,
      ports: {
        lms: this.deps.lms,
        calculator: this.deps.calculator,
        courseContent: this.deps.courseContent,
      },
    };

    let fullAssistantResponse = '';
    const accumulatedCitations: Citation[] = [];
    const maxToolRounds = 3;
    let round = 0;

    while (round < maxToolRounds) {
      round++;
      let currentRoundText = '';
      const pendingToolCalls: ToolCall[] = [];

      const stream = activeLlm.stream({
        systemPrompt,
        messages: messagesForLlm,
        tools: availableTools,
        maxTokens: profile.maxTokens,
        temperature: profile.temperature,
      });

      for await (const event of stream) {
        if (event.type === 'text-delta') {
          currentRoundText += event.delta;
          fullAssistantResponse += event.delta;
          yield toClientStreamEvent(event);
        } else if (event.type === 'tool-status') {
          if (event.status === 'calling') {
            pendingToolCalls.push({
              id: event.callId || `call_${Date.now()}_${pendingToolCalls.length}`,
              name: event.toolName,
              args: (event.args as Record<string, unknown>) || {},
              thoughtSignature: event.thoughtSignature,
            });
          }
          yield toClientStreamEvent(event);
        } else if (event.type === 'citation') {
          accumulatedCitations.push(event.citation);
          yield toClientStreamEvent(event);
        }
      }

      // If no tools were called, the turn is complete
      if (pendingToolCalls.length === 0) {
        break;
      }

      // Record assistant model turn with tool calls before feeding tool responses
      messagesForLlm.push({
        role: 'assistant',
        content: currentRoundText,
        toolCalls: pendingToolCalls,
      });

      // Execute each tool and feed result back to messagesForLlm
      for (const call of pendingToolCalls) {
        yield {
          type: 'tool-status',
          toolName: call.name,
          status: 'executing',
          message: `Executing ${call.name}...`,
        };

        const result: ToolResult = await this.deps.toolRegistry.execute(call, toolExecContext);

        yield {
          type: 'tool-status',
          toolName: call.name,
          status: result.isError ? 'error' : 'complete',
          message: result.isError ? String(result.result) : undefined,
        };

        const citation = this.buildCitationForTool(
          call,
          authContext.courseId,
          Boolean(result.isError),
        );
        if (citation) {
          accumulatedCitations.push(citation);
          yield { type: 'citation', citation };
        }

        const serialized =
          typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
        messagesForLlm.push({
          role: 'tool',
          content: this.wrapToolOutput(call.name, serialized),
          toolResultId: call.id,
          toolName: call.name,
        });
      }
    }

    // 8. Save final assistant message
    const savedAssistantMsg = await this.deps.persistence.saveMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: fullAssistantResponse || 'I have reviewed your course information.',
      citations: accumulatedCitations,
    });

    yield {
      type: 'done',
      conversationId: conversation.id,
      messageId: savedAssistantMsg.id,
    };

    const durationMs = Date.now() - startTime;
    this.deps.telemetry.recordMetric('turn_duration_ms', durationMs, {
      role: authContext.tutorRole,
      courseId: authContext.courseId,
    });

    this.deps.telemetry.recordEvent('turn_completed', {
      userId: authContext.userId,
      role: authContext.tutorRole,
      courseId: authContext.courseId,
      durationMs,
      promptChars: params.message.length,
      responseChars: fullAssistantResponse.length,
      citationsCount: accumulatedCitations.length,
      toolRounds: round - 1,
    });
  }
}
