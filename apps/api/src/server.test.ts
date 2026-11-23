import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  loadAppConfig,
  FakeLogStorageAdapter,
  LtiIdentityAdapter,
  SDI_DEMO_PERSONAS,
} from '@virtual-ta/adapters';
import { buildServer, PortsContainer } from '../src/server.js';

describe('API Server', () => {
  const config = loadAppConfig({
    ...process.env,
    NODE_ENV: 'test',
  });
  const server = buildServer(config);

  it('GET /health returns status ok', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.status).toBe('ok');
    expect(json.college).toBe('sdi');
    expect(json.modelProvider).toBe('fake');
    expect(json.timestamp).toBeDefined();
  });

  it('GET /api/config/demo returns SDI config and demo personas', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/config/demo',
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.college.id).toBe('sdi');
    expect(json.college.theme.brandColor).toBe('#D50032');
    expect(json.personas.length).toBeGreaterThan(0);
    expect(json.modelProvider).toBe('fake');
  });

  it('wires GeminiAdapter when configured with MODEL_PROVIDER=gemini and an API key', () => {
    const geminiConfig = loadAppConfig({
      ...process.env,
      NODE_ENV: 'test',
      MODEL_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'test-secret-gemini-key',
    });
    const geminiServer = buildServer(geminiConfig) as unknown as { ports: PortsContainer };
    expect(geminiConfig.model.studentModel).toBe('gemini-3.8-flash');
    expect(geminiConfig.model.instructorModel).toBe('gemini-3.8-flash');
    expect(geminiConfig.model.classifierModel).toBe('gemini-3.6-flash');
    expect(geminiServer.ports.llm.providerName).toBe('gemini');
    expect(geminiServer.ports.classifierLlm?.providerName).toBe('gemini');
  });

  it('falls back to FakeLlmAdapter when MODEL_PROVIDER=gemini but GEMINI_API_KEY is missing', () => {
    const missingKeyConfig = loadAppConfig({
      ...process.env,
      NODE_ENV: 'test',
      MODEL_PROVIDER: 'gemini',
      GEMINI_API_KEY: '',
    });
    const fallbackServer = buildServer(missingKeyConfig) as unknown as { ports: PortsContainer };
    expect(fallbackServer.ports.llm.providerName).toBe('fake');
  });

  it('wires CanvasDemoIdentityAdapter with FakeLmsAdapter in hybrid mode (Approach 1)', () => {
    const hybridConfig = loadAppConfig({
      ...process.env,
      NODE_ENV: 'test',
      CANVAS_BASE_URL: 'https://classroom.sdi.edu',
      CANVAS_ACCESS_TOKEN: 'valid-test-token-12345',
      CANVAS_USE_FAKE_COURSE_DATA: 'true',
    });
    const hybridServer = buildServer(hybridConfig) as unknown as { ports: PortsContainer };
    expect(hybridConfig.canvas.useFakeCourseData).toBe(true);
    expect(hybridServer.ports.identity.constructor.name).toBe('CanvasDemoIdentityAdapter');
    expect(hybridServer.ports.lms.constructor.name).toBe('FakeLmsAdapter');
  });

  it('wires CanvasRestAdapter when CANVAS_USE_FAKE_COURSE_DATA is explicitly false', () => {
    const liveConfig = loadAppConfig({
      ...process.env,
      NODE_ENV: 'test',
      CANVAS_BASE_URL: 'https://classroom.sdi.edu',
      CANVAS_ACCESS_TOKEN: 'valid-test-token-12345',
      CANVAS_USE_FAKE_COURSE_DATA: 'false',
    });
    const liveServer = buildServer(liveConfig) as unknown as { ports: PortsContainer };
    expect(liveConfig.canvas.useFakeCourseData).toBe(false);
    expect(liveServer.ports.identity.constructor.name).toBe('CanvasDemoIdentityAdapter');
    expect(liveServer.ports.lms.constructor.name).toBe('CanvasRestAdapter');
  });

  it('overrides demo persona canvas user IDs from environment variables', () => {
    const personaConfig = loadAppConfig({
      ...process.env,
      NODE_ENV: 'test',
      DEMO_STUDENT_ID: '8888',
      DEMO_INSTRUCTOR_ID: '7777',
      DEMO_TA_ID: '6666',
    });
    const student = personaConfig.canvas.demoPersonas.find((p) => p.id === 'demo_student');
    const instructor = personaConfig.canvas.demoPersonas.find((p) => p.id === 'demo_instructor');
    const ta = personaConfig.canvas.demoPersonas.find((p) => p.id === 'demo_ta');
    expect(student?.canvasUserId).toBe('8888');
    expect(instructor?.canvasUserId).toBe('7777');
    expect(ta?.canvasUserId).toBe('6666');
  });

  it('GET /api/tools filters tools strictly by role', async () => {
    const studentRes = await server.inject({
      method: 'GET',
      url: '/api/tools?personaId=demo_student',
    });
    expect(studentRes.statusCode).toBe(200);
    const studentData = studentRes.json();
    expect(studentData.role).toBe('student');
    const studentToolNames = studentData.tools.map((t: { name: string }) => t.name);
    expect(studentToolNames).toContain('get_student_grades');
    expect(studentToolNames).not.toContain('get_submission_summaries');

    const instructorRes = await server.inject({
      method: 'GET',
      url: '/api/tools?personaId=demo_instructor',
    });
    expect(instructorRes.statusCode).toBe(200);
    const instructorData = instructorRes.json();
    expect(instructorData.role).toBe('instructor');
    const instructorToolNames = instructorData.tools.map((t: { name: string }) => t.name);
    expect(instructorToolNames).toContain('get_submission_summaries');
    expect(instructorToolNames).not.toContain('get_student_grades');
  });

  it('POST /api/tools/execute enforces role permissions (403 on role breach)', async () => {
    // 1. Student calling student tool -> OK
    const okRes = await server.inject({
      method: 'POST',
      url: '/api/tools/execute',
      payload: {
        personaId: 'demo_student',
        courseId: '101',
        toolName: 'get_student_grades',
      },
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json().isError).toBe(false);

    // 2. Student calling instructor tool -> 403 Forbidden!
    const forbiddenRes = await server.inject({
      method: 'POST',
      url: '/api/tools/execute',
      payload: {
        personaId: 'demo_student',
        courseId: '101',
        toolName: 'get_submission_summaries',
      },
    });
    expect(forbiddenRes.statusCode).toBe(403);
    expect(forbiddenRes.json().error).toBe('Forbidden');

    // 3. Instructor calling instructor tool -> OK
    const instructorOkRes = await server.inject({
      method: 'POST',
      url: '/api/tools/execute',
      payload: {
        personaId: 'demo_instructor',
        courseId: '101',
        toolName: 'get_submission_summaries',
      },
    });
    expect(instructorOkRes.statusCode).toBe(200);
    expect(instructorOkRes.json().isError).toBe(false);
  });

  it('POST /api/chat streams SSE events for student and instructor', async () => {
    // 1. Student chat stream
    const studentStreamRes = await server.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        personaId: 'demo_student',
        courseId: '101',
        message: 'When is Week 1 Lab due?',
      },
    });

    expect(studentStreamRes.statusCode).toBe(200);
    expect(studentStreamRes.headers['content-type']).toContain('text/event-stream');
    expect(studentStreamRes.body).toContain('data: {"type":');
    expect(studentStreamRes.body).toContain('"type":"done"');

    // 2. Instructor chat stream
    const instructorStreamRes = await server.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        personaId: 'demo_instructor',
        courseId: '101',
        message: 'Draft an announcement regarding the deadline.',
      },
    });

    expect(instructorStreamRes.statusCode).toBe(200);
    expect(instructorStreamRes.headers['content-type']).toContain('text/event-stream');
    expect(instructorStreamRes.body).toContain('"type":"done"');
  });

  it('declines course material under logistics_only setting (Phase 3 exit criteria)', async () => {
    // Set course to logistics_only as instructor
    const putRes = await server.inject({
      method: 'PUT',
      url: '/api/courses/sdi-ftt101/settings',
      payload: { setting: 'logistics_only', personaId: 'demo_instructor' },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().setting).toBe('logistics_only');

    // Student asks subject matter question
    const chatRes = await server.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        personaId: 'demo_student',
        courseId: 'sdi-ftt101',
        message: 'How do I solve question 2 of the lab?',
      },
    });

    expect(chatRes.statusCode).toBe(200);
    expect(chatRes.body).toContain('configured this Virtual TA for course logistics only');

    // Reset back to full
    await server.inject({
      method: 'PUT',
      url: '/api/courses/sdi-ftt101/settings',
      payload: { setting: 'full', personaId: 'demo_instructor' },
    });
  });

  it('supports "clear my data" student opt-out endpoint end-to-end', async () => {
    // 1. Student starts a conversation
    await server.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        personaId: 'demo_student',
        courseId: 'sdi-ftt101',
        message: 'Check my lab status',
      },
    });

    // 2. Delete using UI personaId parameter (resolves to user-1001)
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/users/demo_student/data?personaId=demo_student',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // 3. Conversations list for student is now empty
    const listAfter = await server.inject({
      method: 'GET',
      url: '/api/conversations?personaId=demo_student&courseId=sdi-ftt101',
    });
    expect(listAfter.statusCode).toBe(200);
    expect(listAfter.json()).toEqual([]);

    // 4. Attempting to delete another user's data is rejected with 403
    const crossUserDelete = await server.inject({
      method: 'DELETE',
      url: '/api/users/user-2001/data?personaId=demo_student',
    });
    expect(crossUserDelete.statusCode).toBe(403);
  });

  it('supports one-command demo reset endpoint (plan Phase 5)', async () => {
    // 1. Alter setting to logistics_only
    await server.inject({
      method: 'PUT',
      url: '/api/courses/sdi-ftt101/settings',
      payload: { setting: 'logistics_only', personaId: 'demo_instructor' },
    });

    // 2. Call demo reset
    const resetRes = await server.inject({
      method: 'POST',
      url: '/api/demo/reset',
      payload: { courseId: 'sdi-ftt101' },
    });

    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json().success).toBe(true);
    expect(resetRes.json().setting).toBe('full');

    // 3. Verify settings restored to full
    const getRes = await server.inject({
      method: 'GET',
      url: '/api/courses/sdi-ftt101/settings',
    });
    expect(getRes.json().setting).toBe('full');
  });

  it('intercepts crisis messages, streams emergency 988 resources, and logs incident under FERPA § 99.36', async () => {
    // 1. Post crisis message
    const chatRes = await server.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        personaId: 'demo_student',
        courseId: 'sdi-ftt101',
        message: 'I am in severe distress and want to commit suicide',
      },
    });

    expect(chatRes.statusCode).toBe(200);
    expect(chatRes.body).toContain('"type":"crisis"');
    expect(chatRes.body).toContain('988');
    expect(chatRes.body).toContain('SDI Student Support');

    // 2. Verify incident is recorded in admin audit log (instructor/staff access required)
    const adminRes = await server.inject({
      method: 'GET',
      url: '/api/admin/crisis-incidents?personaId=demo_instructor',
    });

    expect(adminRes.statusCode).toBe(200);
    const json = adminRes.json();
    expect(json.totalIncidents).toBeGreaterThan(0);
    expect(json.incidents[0].triggerSnippet).toBe('suicide');
    expect(json.incidents[0].category).toContain('self-harm');
  });

  describe('Conversation History & Resumption (Student Access & IDOR defense)', () => {
    it('allows a student to create a chat, list previous chats with previews, and resume it', async () => {
      // 1. Initial chat turn
      const chat1 = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_student',
          courseId: 'sdi-ftt101',
          message: 'When is Safety Lab 1 due?',
        },
      });

      expect(chat1.statusCode).toBe(200);
      const doneLine = chat1.body
        .split('\n')
        .find((l) => l.includes('"type":"done"'));
      expect(doneLine).toBeDefined();
      const doneEvent = JSON.parse(doneLine!.replace(/^data:\s*/, ''));
      const convId = doneEvent.conversationId;
      expect(convId).toBeDefined();

      // 2. Student lists previous conversations by personaId
      const listRes = await server.inject({
        method: 'GET',
        url: `/api/conversations?personaId=demo_student&courseId=sdi-ftt101`,
      });

      expect(listRes.statusCode).toBe(200);
      const convs = listRes.json();
      expect(Array.isArray(convs)).toBe(true);
      const found = convs.find((c: { id: string }) => c.id === convId);
      expect(found).toBeDefined();
      expect(found.title).toContain('When is Safety Lab 1 due');
      expect(found.messageCount).toBe(2); // user + assistant

      // 3. Student views full chat log for that conversation
      const msgRes = await server.inject({
        method: 'GET',
        url: `/api/conversations/${convId}/messages?personaId=demo_student`,
      });

      expect(msgRes.statusCode).toBe(200);
      const msgs = msgRes.json();
      expect(msgs.length).toBe(2);
      expect(msgs[0].role).toBe('user');
      expect(msgs[0].content).toBe('When is Safety Lab 1 due?');
      expect(msgs[1].role).toBe('assistant');

      // 4. Student resumes previous chat by sending conversationId
      const chat2 = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_student',
          courseId: 'sdi-ftt101',
          conversationId: convId,
          message: 'Thank you! Can you clarify the submission format?',
        },
      });

      expect(chat2.statusCode).toBe(200);
      const doneLine2 = chat2.body
        .split('\n')
        .find((l) => l.includes('"type":"done"'));
      expect(doneLine2).toBeDefined();
      const doneEvent2 = JSON.parse(doneLine2!.replace(/^data:\s*/, ''));
      expect(doneEvent2.conversationId).toBe(convId);

      // Verify thread length increased to 4
      const msgRes2 = await server.inject({
        method: 'GET',
        url: `/api/conversations/${convId}/messages?personaId=demo_student`,
      });
      expect(msgRes2.json().length).toBe(4);
    });

    it('rejects viewing another user\'s conversation log (IDOR defense)', async () => {
      // 1. Create conversation as instructor
      const instChat = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_instructor',
          courseId: 'sdi-ftt101',
          message: 'Draft an announcement regarding the exam.',
        },
      });

      const doneLine = instChat.body
        .split('\n')
        .find((l) => l.includes('"type":"done"'));
      const convId = JSON.parse(doneLine!.replace(/^data:\s*/, '')).conversationId;

      // 2. Student attempts to access instructor conversation
      const studentAttempt = await server.inject({
        method: 'GET',
        url: `/api/conversations/${convId}/messages?personaId=demo_student`,
      });

      expect(studentAttempt.statusCode).toBe(403);
      expect(studentAttempt.json().error).toBe('Forbidden');
    });
  });

  describe('Demo Authentication & Hardening (critique §4.3, §8)', () => {
    const secureConfig = {
      ...config,
      demoAuth: {
        enabled: true,
        password: 'sdi-secure-demo-pass',
        invitedEmails: ['invited.guest@sdi.edu', 'evaluator@sdi.edu'],
      },
    };
    const secureServer = buildServer(secureConfig);

    it('rejects protected endpoints when unauthenticated', async () => {
      const res = await secureServer.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_student',
          message: 'Hello',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Unauthorized');
    });

    it('rejects login with incorrect password', async () => {
      const res = await secureServer.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'wrong-password' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Unauthorized');
    });

    it('allows login with valid password and grants access via Bearer token', async () => {
      const loginRes = await secureServer.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'sdi-secure-demo-pass' },
      });

      expect(loginRes.statusCode).toBe(200);
      const { token } = loginRes.json();
      expect(token).toMatch(/^demo_/);

      // Call protected chat with Bearer token
      const chatRes = await secureServer.inject({
        method: 'POST',
        url: '/api/chat',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          personaId: 'demo_student',
          courseId: 'sdi-ftt101',
          message: 'When is Safety Lab 1 due?',
        },
      });

      expect(chatRes.statusCode).toBe(200);
      expect(chatRes.headers['content-type']).toContain('text/event-stream');
    });

    it('allows access via Cloudflare Access header for invited emails', async () => {
      const cfRes = await secureServer.inject({
        method: 'POST',
        url: '/api/chat',
        headers: {
          'cf-access-authenticated-user-email': 'evaluator@sdi.edu',
          'cf-access-jwt-assertion': 'valid-test-assertion-jwt',
        },
        payload: {
          personaId: 'demo_instructor',
          courseId: 'sdi-ftt101',
          message: 'Draft an announcement.',
        },
      });

      expect(cfRes.statusCode).toBe(200);
    });

    it('rejects access via Cloudflare Access header when jwt assertion is missing', async () => {
      const cfRes = await secureServer.inject({
        method: 'POST',
        url: '/api/chat',
        headers: {
          'cf-access-authenticated-user-email': 'evaluator@sdi.edu',
        },
        payload: {
          personaId: 'demo_instructor',
          courseId: 'sdi-ftt101',
          message: 'Draft an announcement.',
        },
      });

      expect(cfRes.statusCode).toBe(401);
    });

    it('rejects access via Cloudflare Access header for uninvited email', async () => {
      const cfRes = await secureServer.inject({
        method: 'POST',
        url: '/api/chat',
        headers: {
          'cf-access-authenticated-user-email': 'unauthorized.user@external.com',
        },
        payload: {
          personaId: 'demo_student',
          message: 'Hello',
        },
      });

      expect(cfRes.statusCode).toBe(401);
    });

    it('ensures Canvas token is never exposed to public configuration endpoint', async () => {
      const res = await secureServer.inject({
        method: 'GET',
        url: '/api/config/demo',
      });

      expect(res.statusCode).toBe(200);
      const text = res.body;
      expect(text).not.toContain('mock-dev-token');
      expect(text).not.toContain(config.canvas.accessToken);
    });

    it('flushes configured LogStoragePort when server closes', async () => {
      const fakeStorage = new FakeLogStorageAdapter();
      const instance = buildServer(config, { logStorage: fakeStorage });

      await instance.ready();
      expect(fakeStorage.flushCount).toBe(0);

      await instance.close();
      expect(fakeStorage.flushCount).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/tools returns filtered tools based on session role', async () => {
      const studentRes = await server.inject({
        method: 'GET',
        url: '/api/tools?personaId=demo_student&courseId=sdi-ftt101',
      });
      expect(studentRes.statusCode).toBe(200);
      const studentData = studentRes.json();
      expect(studentData.role).toBe('student');
      expect(studentData.tools.some((t: any) => t.requiredRole === 'instructor')).toBe(false);

      const instructorRes = await server.inject({
        method: 'GET',
        url: '/api/tools?personaId=demo_instructor&courseId=sdi-ftt101',
      });
      expect(instructorRes.statusCode).toBe(200);
      const instructorData = instructorRes.json();
      expect(instructorData.role).toBe('instructor');
      expect(instructorData.tools.some((t: any) => t.name === 'get_submission_summaries')).toBe(true);
    });

    it('GET /api/admin/crisis-incidents enforces authentication, instructor RBAC, and returns incidents', async () => {
      const unauthRes = await secureServer.inject({
        method: 'GET',
        url: '/api/admin/crisis-incidents?personaId=demo_instructor',
      });
      expect(unauthRes.statusCode).toBe(401);

      const loginRes = await secureServer.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'sdi-secure-demo-pass' },
      });
      const { token } = loginRes.json();

      // Student persona is denied even when authenticated
      const studentDenied = await secureServer.inject({
        method: 'GET',
        url: '/api/admin/crisis-incidents?personaId=demo_student',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(studentDenied.statusCode).toBe(403);

      const authRes = await secureServer.inject({
        method: 'GET',
        url: '/api/admin/crisis-incidents?personaId=demo_instructor',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(authRes.statusCode).toBe(200);
      expect(authRes.json().collegeId).toBe('sdi');
      expect(Array.isArray(authRes.json().incidents)).toBe(true);
    });

    it('enforces student 403 RBAC on PUT /api/courses/:courseId/settings, mandatory message ownership checks, and Zod validation', async () => {
      // Student cannot update course settings
      const studentPut = await server.inject({
        method: 'PUT',
        url: '/api/courses/sdi-ftt101/settings',
        payload: { setting: 'logistics_only', personaId: 'demo_student' },
      });
      expect(studentPut.statusCode).toBe(403);

      // Invalid setting rejected with 400
      const invalidSetting = await server.inject({
        method: 'PUT',
        url: '/api/courses/sdi-ftt101/settings',
        payload: { setting: 'invalid_mode', personaId: 'demo_instructor' },
      });
      expect(invalidSetting.statusCode).toBe(400);

      // Create a conversation then call GET /messages without caller query -> 400
      const chatRes = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { personaId: 'demo_student', courseId: 'sdi-ftt101', message: 'Hi there' },
      });
      const doneLine = chatRes.body.split('\n').find((l) => l.includes('"type":"done"'));
      const convId = JSON.parse(doneLine!.replace(/^data:\s*/, '')).conversationId;

      const noOwnerMsgRes = await server.inject({
        method: 'GET',
        url: `/api/conversations/${convId}/messages`,
      });
      expect(noOwnerMsgRes.statusCode).toBe(400);

      // Empty or oversized chat message -> 400
      const emptyChat = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { personaId: 'demo_student', message: '   ' },
      });
      expect(emptyChat.statusCode).toBe(400);

      const hugeChat = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { personaId: 'demo_student', message: 'a'.repeat(8001) },
      });
      expect(hugeChat.statusCode).toBe(400);

      // DELETE /api/users/me/data works properly
      const deleteMe = await server.inject({
        method: 'DELETE',
        url: '/api/users/me/data?personaId=demo_student',
      });
      expect(deleteMe.statusCode).toBe(200);
    });

    it('wires shared LogStoragePort into PrivacyTelemetryAdapter, configures instructorLlm, sets security headers, and sanitizes SSE tool events', async () => {
      const fakeStorage = new FakeLogStorageAdapter();
      const recordedPrompts: string[] = [];
      let instructorSawContext = false;

      const geminiConfig = loadAppConfig({
        ...process.env,
        NODE_ENV: 'test',
        MODEL_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'test-key',
        STUDENT_MODEL: 'gemini-3.8-flash',
        INSTRUCTOR_MODEL: 'gemini-3.8-pro',
      });
      const wiredServer = buildServer(geminiConfig) as unknown as { ports: PortsContainer };
      expect(wiredServer.ports.instructorLlm?.providerName).toBe('gemini');
      expect((wiredServer.ports.instructorLlm as { defaultModel?: string }).defaultModel).toBe(
        'gemini-3.8-pro',
      );

      const customServer = buildServer(config, {
        logStorage: fakeStorage,
        llm: {
          providerName: 'spy-llm',
          getCapabilities: () =>
            ({
              streaming: true,
              parallelToolCalls: true,
              reasoning: false,
              maxContextTokens: 8192,
              structuredOutput: false,
              supportsPromptCaching: false,
            }) as const,
          generate: async () => ({ text: 'logistics' }),
          stream: async function* (opts) {
            recordedPrompts.push(opts.systemPrompt);
            if (opts.systemPrompt.includes('Canvas page content text')) {
              instructorSawContext = true;
            }
            yield {
              type: 'tool-status',
              toolName: 'calculate',
              status: 'calling',
              callId: 'internal_call_1',
              args: { expression: '2+2' },
              thoughtSignature: 'internal_sig_xyz',
              message: 'Calculating...',
            };
            yield { type: 'text-delta', delta: 'Result is 4.' };
            yield { type: 'usage', promptTokens: 45, completionTokens: 12, totalTokens: 57 };
          },
        },
      });

      const chatRes = await customServer.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_student',
          courseId: 'sdi-ftt101',
          message: 'Check 2+2',
          pageContext: {
            title: 'Page 1',
            content: 'Canvas page content text',
          },
        },
      });

      expect(chatRes.statusCode).toBe(200);
      expect(chatRes.headers['x-content-type-options']).toBe('nosniff');
      expect(chatRes.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(instructorSawContext).toBe(true);
      expect(recordedPrompts[0]).toContain('<untrusted_canvas_data source="current_page">');

      // Ensure raw thoughtSignature, internal args, and internal usage chunks were stripped from SSE wire output
      expect(chatRes.body).not.toContain('internal_sig_xyz');
      expect(chatRes.body).not.toContain('internal_call_1');
      expect(chatRes.body).not.toContain('"type":"usage"');

      // Single shared LogStorage received telemetry and flushes on close (including token usage)
      expect(fakeStorage.entries.length).toBeGreaterThan(0);
      expect(fakeStorage.entries.some((e) => e.includes('llm_tokens_total'))).toBe(true);
      await customServer.close();
      expect(fakeStorage.flushCount).toBeGreaterThanOrEqual(1);
    });

    it('rejects unauthenticated email-only login when password is configured and rate-limits repeated login failures', async () => {
      const isolatedServer = buildServer({
        ...config,
        demoAuth: {
          enabled: true,
          password: 'expected-pass',
          invitedEmails: ['invited@sdi.edu'],
        },
      });

      // Email-only login rejected when password is required
      const emailOnlyRes = await isolatedServer.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'invited@sdi.edu' },
      });
      expect(emailOnlyRes.statusCode).toBe(401);

      // Exhaust 10 allowed attempts in window, then 11th triggers 429
      for (let i = 0; i < 9; i++) {
        const res = await isolatedServer.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { password: 'wrong' },
        });
        expect(res.statusCode).toBe(401);
      }

      const throttled = await isolatedServer.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'wrong' },
      });
      expect(throttled.statusCode).toBe(429);
      expect(throttled.headers['retry-after']).toBeDefined();
    });

    it('POST /api/chat emits error event if turn execution throws an unexpected error', async () => {
      // Create a server with a faulty engine that throws
      const throwingServer = buildServer(config, {
        llm: {
          providerName: 'faulty',
          getCapabilities: () => ({ streaming: true } as any),
          generate: async () => ({ text: '' }),
          // eslint-disable-next-line require-yield
          stream: async function* () {
            throw new Error('Unexpected LLM engine explosion');
          },
        },
      });

      const res = await throwingServer.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_student',
          message: 'Trigger failure',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('"type":"error"');
      expect(res.body).toContain('Unexpected LLM engine explosion');
    });

    it('returns standard 404 for unknown endpoints', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/unknown-endpoint-that-does-not-exist',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Not Found');
    });

    it('uses domain-aware contextual moderation to avoid firearms false positives and escalate multi-turn distress', async () => {
      const contextualServer = buildServer(config);

      // 1. Technical firearms terminology must NOT trigger crisis
      const firearmsRes = await contextualServer.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_student',
          courseId: 'sdi-ftt101',
          message:
            'How do I check chamber headspace and firing pin protrusion after adjusting trigger pull?',
        },
      });
      expect(firearmsRes.statusCode).toBe(200);
      expect(firearmsRes.body).not.toContain('"type":"crisis"');

      // 2. Prior distress turn + ambiguous goodbye/give-up follow-up must trigger crisis SSE event and FERPA §99.36 incident
      const turn1 = await contextualServer.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_student',
          courseId: 'sdi-ftt101',
          message: 'I feel completely overwhelmed and hopeless this week.',
        },
      });
      expect(turn1.statusCode).toBe(200);
      const doneMatch = turn1.body.match(/"conversationId":"([^"]+)"/);
      expect(doneMatch).not.toBeNull();
      const convId = doneMatch![1];

      const turn2 = await contextualServer.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_student',
          courseId: 'sdi-ftt101',
          conversationId: convId,
          message: 'I just want to give up and say goodbye.',
        },
      });
      expect(turn2.statusCode).toBe(200);
      expect(turn2.body).toContain('"type":"crisis"');
      expect(turn2.body).toContain('988');

      const incidentsRes = await contextualServer.inject({
        method: 'GET',
        url: '/api/admin/crisis-incidents?personaId=demo_instructor',
      });
      expect(incidentsRes.statusCode).toBe(200);
      expect(incidentsRes.json().incidents.length).toBeGreaterThanOrEqual(1);
    });

    it('serves LTI 1.3 developer key config & JWKS and rejects OIDC login when LTI_ENABLED=false', async () => {
      const cfgRes = await server.inject({ method: 'GET', url: '/api/lti/config' });
      expect(cfgRes.statusCode).toBe(200);
      const cfgJson = cfgRes.json();
      expect(cfgJson.title).toBe('SDI Virtual TA');
      expect(cfgJson.oidc_initiation_url).toContain('/api/lti/login');

      const jwksRes = await server.inject({ method: 'GET', url: '/api/lti/jwks' });
      expect(jwksRes.statusCode).toBe(200);
      expect(jwksRes.json().keys[0].kty).toBe('RSA');

      const loginDisabled = await server.inject({
        method: 'GET',
        url: '/api/lti/login?iss=https://canvas.instructure.com&login_hint=1001',
      });
      expect(loginDisabled.statusCode).toBe(403);
    });

    it('completes LTI 1.3 OIDC login, RS256 launch, session lookup, and prevents role spoofing', async () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

      const ltiConfig = loadAppConfig({
        ...process.env,
        NODE_ENV: 'test',
        LTI_ENABLED: 'true',
        DEMO_AUTH_ENABLED: 'true',
        DEMO_PASSWORD: 'admin-only-password',
      });

      const customLtiAdapter = new LtiIdentityAdapter({
        allowedPersonas: SDI_DEMO_PERSONAS,
        platformPublicKeyPem: publicKeyPem,
        deploymentId: ltiConfig.lti.deploymentId,
      });

      const ltiServer = buildServer(ltiConfig, { identity: customLtiAdapter });

      // 1. OIDC Login Initiation
      const loginJsonRes = await ltiServer.inject({
        method: 'GET',
        url: '/api/lti/login?iss=https://canvas.instructure.com&login_hint=1001',
        headers: { Accept: 'application/json' },
      });
      expect(loginJsonRes.statusCode).toBe(200);
      const { state, nonce, redirectUrl } = loginJsonRes.json();
      expect(redirectUrl).toContain(nonce);

      const signToken = (payload: Record<string, unknown>) => {
        const enc = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
        const input = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(payload)}`;
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(input);
        signer.end();
        return `${input}.${signer.sign(privateKey).toString('base64url')}`;
      };

      const nowSec = Math.floor(Date.now() / 1000);
      const studentJwt = signToken({
        iss: 'https://canvas.instructure.com',
        aud: ltiConfig.lti.clientId,
        sub: '1001',
        exp: nowSec + 300,
        nonce,
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': ltiConfig.lti.deploymentId,
        'https://purl.imsglobal.org/spec/lti/claim/roles': [
          'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
        ],
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          canvas_user_id: '1001',
          canvas_course_id: 'sdi-ftt101',
        },
      });

      // 2. form_post Launch with application/x-www-form-urlencoded returning 302
      const formLaunch = await ltiServer.inject({
        method: 'POST',
        url: '/api/lti/launch',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `id_token=${encodeURIComponent(studentJwt)}&state=${encodeURIComponent(state)}`,
      });
      expect(formLaunch.statusCode).toBe(302);
      const location = String(formLaunch.headers.location);
      expect(location).toContain('embedded=true');
      expect(location).toContain('ltiToken=lti_');

      const launchedToken = new URLSearchParams(location.split('?')[1]).get('ltiToken')!;

      // 3. Session endpoint validates token
      const sessionRes = await ltiServer.inject({
        method: 'GET',
        url: '/api/lti/session',
        headers: { Authorization: `Bearer ${launchedToken}` },
      });
      expect(sessionRes.statusCode).toBe(200);
      expect(sessionRes.json().context.assistantRole).toBe('student');

      // 4. Attempting to spoof personaId='demo_instructor' with a student LTI token is rejected (403)
      const spoofRes = await ltiServer.inject({
        method: 'PUT',
        url: '/api/courses/sdi-ftt101/settings',
        headers: { Authorization: `Bearer ${launchedToken}` },
        payload: { setting: 'logistics_only', personaId: 'demo_instructor' },
      });
      expect(spoofRes.statusCode).toBe(403);

      // 5. Instructor JSON launch works seamlessly with DEMO_AUTH_ENABLED=true
      const instructorJwt = signToken({
        iss: 'https://canvas.instructure.com',
        aud: ltiConfig.lti.clientId,
        sub: '2001',
        exp: nowSec + 300,
        nonce: 'inst-nonce',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': ltiConfig.lti.deploymentId,
        'https://purl.imsglobal.org/spec/lti/claim/roles': [
          'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
        ],
        'https://purl.imsglobal.org/spec/lti/claim/target_link_uri':
          'http://localhost:5173/api/lti/launch?placement=course_navigation',
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          canvas_user_id: '2001',
          canvas_course_id: 'sdi-ftt101',
        },
      });
      const jsonLaunch = await ltiServer.inject({
        method: 'POST',
        url: '/api/lti/launch',
        headers: { Accept: 'application/json' },
        payload: { id_token: instructorJwt },
      });
      expect(jsonLaunch.statusCode).toBe(200);
      expect(jsonLaunch.json().placement).toBe('course_navigation');

      const instructorToken = jsonLaunch.json().sessionToken;
      const chatRes = await ltiServer.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { Authorization: `Bearer ${instructorToken}` },
        payload: { message: 'Which assignments are missing due dates?' },
      });
      expect(chatRes.statusCode).toBe(200);
      expect(chatRes.body).toContain('"type":"done"');
    });

    it('POST /api/admin/retention/purge enforces instructor RBAC and purges expired records', async () => {
      const studentAttempt = await server.inject({
        method: 'POST',
        url: '/api/admin/retention/purge',
        payload: { personaId: 'demo_student', retentionDays: 90 },
      });
      expect(studentAttempt.statusCode).toBe(403);

      const invalidDays = await server.inject({
        method: 'POST',
        url: '/api/admin/retention/purge',
        payload: { personaId: 'demo_instructor', retentionDays: -5 },
      });
      expect(invalidDays.statusCode).toBe(400);

      const okRes = await server.inject({
        method: 'POST',
        url: '/api/admin/retention/purge',
        payload: { personaId: 'demo_instructor', retentionDays: 90 },
      });
      expect(okRes.statusCode).toBe(200);
      expect(okRes.json().success).toBe(true);
      expect(okRes.json().retentionDays).toBe(90);
      expect(typeof okRes.json().deletedConversations).toBe('number');
    });

    it('supports Sprint 3 Option B endpoints: off/blackout settings, confusion pulse, practice check, delete thread, feedback, and crisis triage', async () => {
      // 1. Settings with blackout window and off mode
      const offRes = await server.inject({
        method: 'PUT',
        url: '/api/courses/sdi-ftt101/settings',
        payload: {
          personaId: 'demo_instructor',
          setting: 'off',
          blackoutStart: '2026-11-25T10:00:00Z',
          blackoutEnd: '2026-11-25T12:00:00Z',
        },
      });
      expect(offRes.statusCode).toBe(200);
      expect(offRes.json().setting).toBe('off');
      expect(offRes.json().blackoutStart).toBeDefined();

      // Practice check rejected when course is off
      const blockedPractice = await server.inject({
        method: 'POST',
        url: '/api/practice-check',
        payload: { personaId: 'demo_student', courseId: 'sdi-ftt101', topic: 'headspace' },
      });
      expect(blockedPractice.statusCode).toBe(403);

      // Restore full mode without blackout
      const fullRes = await server.inject({
        method: 'PUT',
        url: '/api/courses/sdi-ftt101/settings',
        payload: {
          personaId: 'demo_instructor',
          setting: 'full',
          blackoutStart: null,
          blackoutEnd: null,
        },
      });
      expect(fullRes.statusCode).toBe(200);

      // Practice check succeeds in full mode
      const practiceRes = await server.inject({
        method: 'POST',
        url: '/api/practice-check',
        payload: { personaId: 'demo_student', courseId: 'sdi-ftt101', topic: 'headspace' },
      });
      expect(practiceRes.statusCode).toBe(200);
      expect(Array.isArray(practiceRes.json().cards)).toBe(true);

      // Confusion pulse requires instructor role
      const studentPulse = await server.inject({
        method: 'GET',
        url: '/api/courses/sdi-ftt101/confusion-pulse?personaId=demo_student',
      });
      expect(studentPulse.statusCode).toBe(403);

      const instPulse = await server.inject({
        method: 'GET',
        url: '/api/courses/sdi-ftt101/confusion-pulse?personaId=demo_instructor',
      });
      expect(instPulse.statusCode).toBe(200);
      expect(typeof instPulse.json().thresholdMet).toBe('boolean');

      // Feedback endpoint
      const fbRes = await server.inject({
        method: 'POST',
        url: '/api/feedback',
        payload: {
          personaId: 'demo_student',
          courseId: 'sdi-ftt101',
          conversationId: 'conv_fb_1',
          messageId: 'm1',
          rating: 'up',
        },
      });
      expect(fbRes.statusCode).toBe(200);
      expect(fbRes.json().success).toBe(true);

      // Create & delete a student conversation
      const chat = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_student',
          courseId: 'sdi-ftt101',
          message: 'When is Lab 1 due?',
        },
      });
      const doneLine = chat.body.split('\n').find((l) => l.includes('"type":"done"'));
      const convId = JSON.parse(doneLine!.replace(/^data:\s*/, '')).conversationId;

      const delRes = await server.inject({
        method: 'DELETE',
        url: `/api/conversations/${convId}?personaId=demo_student`,
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().success).toBe(true);

      // Crisis incident PATCH RBAC & 404
      const studentPatch = await server.inject({
        method: 'PATCH',
        url: '/api/admin/crisis-incidents/nonexistent',
        payload: { personaId: 'demo_student', status: 'acknowledged' },
      });
      expect(studentPatch.statusCode).toBe(403);

      const missingPatch = await server.inject({
        method: 'PATCH',
        url: '/api/admin/crisis-incidents/nonexistent',
        payload: { personaId: 'demo_instructor', status: 'acknowledged' },
      });
      expect(missingPatch.statusCode).toBe(404);

      // Persistent user learning context & separate chat vs context deletion
      await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          personaId: 'demo_student',
          courseId: 'sdi-ftt101',
          message: 'Please explain chamber headspace tolerance step by step.',
        },
      });
      const getCtxRes = await server.inject({
        method: 'GET',
        url: '/api/users/demo_student/context?personaId=demo_student',
      });
      expect(getCtxRes.statusCode).toBe(200);
      expect(getCtxRes.json().preferredStyle).toBe('step-by-step explanations');

      // Delete only previous chats preserves personal context
      const delChatsOnly = await server.inject({
        method: 'DELETE',
        url: '/api/users/demo_student/data?personaId=demo_student&scope=chats',
      });
      expect(delChatsOnly.statusCode).toBe(200);
      const ctxAfterChats = await server.inject({
        method: 'GET',
        url: '/api/users/demo_student/context?personaId=demo_student',
      });
      expect(ctxAfterChats.json().preferredStyle).toBe('step-by-step explanations');

      // Update learning context via PUT
      const putCtxRes = await server.inject({
        method: 'PUT',
        url: '/api/users/demo_student/context?personaId=demo_student',
        payload: {
          preferredStyle: 'concise bulleted summaries',
          notes: 'Focus on safety checks',
        },
      });
      expect(putCtxRes.statusCode).toBe(200);
      expect(putCtxRes.json().preferredStyle).toBe('concise bulleted summaries');
      expect(putCtxRes.json().notes).toBe('Focus on safety checks');

      // Delete personal context clears context
      const delCtxRes = await server.inject({
        method: 'DELETE',
        url: '/api/users/demo_student/context?personaId=demo_student',
      });
      expect(delCtxRes.statusCode).toBe(200);
      expect(delCtxRes.json().cleared).toBe(true);

      // Canvas OAuth2 opt-in status & disabled guard
      const oauthStatus = await server.inject({
        method: 'GET',
        url: '/api/oauth/canvas/status?personaId=demo_student',
      });
      expect(oauthStatus.statusCode).toBe(200);
      expect(oauthStatus.json().enabled).toBe(false);

      const oauthDisabled = await server.inject({
        method: 'GET',
        url: '/api/oauth/canvas/login?personaId=demo_student',
      });
      expect(oauthDisabled.statusCode).toBe(400);
    });
  });
});
