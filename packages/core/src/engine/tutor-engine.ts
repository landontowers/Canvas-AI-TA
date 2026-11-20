import {
  LlmPort,
  LmsPort,
  IdentityPort,
  PersistencePort,
  CalculatorPort,
  ModerationPort,
  TelemetryPort,
  CourseContentPort,
} from '../ports/index.js';
import { StreamEvent } from '../types/stream.js';
import { Citation, MessageRole } from '../types/message.js';
import { ToolCall, ToolResult } from '../types/tool.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { ToolExecutionContext } from '../tools/tool.types.js';
import { STUDENT_HARNESS_PROFILE } from '../profiles/student.profile.js';
import { INSTRUCTOR_HARNESS_PROFILE } from '../profiles/instructor.profile.js';
import { evaluateStudentPolicy, QuestionClassification } from '../policy/classifier.js';
import { CollegeConfig } from '../config/schema.js';

export interface TutorEngineDependencies {
  llm: LlmPort;
  classifierLlm?: LlmPort;
  lms: LmsPort;
  identity: IdentityPort;
  persistence: PersistencePort;
  calculator: CalculatorPort;
  moderation: ModerationPort;
  telemetry: TelemetryPort;
  toolRegistry: ToolRegistry;
  collegeConfig: CollegeConfig;
  courseContent?: CourseContentPort;
}

export interface TurnParameters {
  personaId?: string;
  courseId?: string;
  conversationId?: string;
  message: string;
}

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

    // 3. Safety & Crisis check (critique §3.8)
    const moderation = await this.deps.moderation.checkContent(params.message, authContext.userId);
    if (moderation.crisisDetected) {
      const crisisText =
        moderation.crisisMessage || this.deps.collegeConfig.crisis.message;

      yield {
        type: 'text-delta',
        delta: crisisText,
      };

      const savedMsg = await this.deps.persistence.saveMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: crisisText,
      });

      yield {
        type: 'done',
        conversationId: conversation.id,
        messageId: savedMsg.id,
      };

      this.deps.telemetry.recordEvent('crisis_detected', {
        userId: authContext.userId,
        categories: moderation.categories.join(','),
      });
      return;
    }

    // 4. Role-based Profile and Policy check
    const isStudent = authContext.tutorRole === 'student';
    const profile = isStudent ? STUDENT_HARNESS_PROFILE : INSTRUCTOR_HARNESS_PROFILE;

    if (isStudent) {
      // Enforce Course Setting (critique §3.4)
      const courseSettings = await this.deps.persistence.getCourseSettings(authContext.courseId);

      if (courseSettings.setting === 'logistics_only') {
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
    }

    // 5. Build tool list for session role (critique §3.14)
    let availableTools = this.deps.toolRegistry.getToolsForRole(authContext.tutorRole);

    // If logistics_only setting is active, strip course content tools as server-side guard
    const courseSettings = await this.deps.persistence.getCourseSettings(authContext.courseId);
    if (courseSettings.setting === 'logistics_only') {
      availableTools = availableTools.filter(
        (t) =>
          t.name !== 'get_course_page' &&
          t.name !== 'get_course_modules' &&
          t.name !== 'get_assignment_details',
      );
    }

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

      const stream = this.deps.llm.stream({
        systemPrompt: profile.systemPrompt,
        messages: messagesForLlm,
        tools: availableTools,
        maxTokens: profile.maxTokens,
        temperature: profile.temperature,
      });

      for await (const event of stream) {
        if (event.type === 'text-delta') {
          currentRoundText += event.delta;
          fullAssistantResponse += event.delta;
          yield event;
        } else if (event.type === 'tool-status') {
          yield event;
          if (event.status === 'calling') {
            pendingToolCalls.push({
              id: event.callId || `call_${Date.now()}_${pendingToolCalls.length}`,
              name: event.toolName,
              args: (event.args as Record<string, unknown>) || {},
            });
          }
        } else if (event.type === 'citation') {
          accumulatedCitations.push(event.citation);
          yield event;
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

        // Attach citation if tool returns Canvas page, assignment, or syllabus
        if (call.name === 'get_syllabus') {
          const cit: Citation = {
            title: 'Course Syllabus',
            url: `/courses/${authContext.courseId}/syllabus`,
            type: 'syllabus',
          };
          accumulatedCitations.push(cit);
          yield { type: 'citation', citation: cit };
        } else if (call.name === 'get_assignment_details' && typeof call.args.assignmentId === 'string') {
          const cit: Citation = {
            title: 'Assignment Details',
            url: `/courses/${authContext.courseId}/assignments/${call.args.assignmentId}`,
            type: 'assignment',
          };
          accumulatedCitations.push(cit);
          yield { type: 'citation', citation: cit };
        }

        messagesForLlm.push({
          role: 'tool',
          content: typeof result.result === 'string' ? result.result : JSON.stringify(result.result),
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
  }
}
