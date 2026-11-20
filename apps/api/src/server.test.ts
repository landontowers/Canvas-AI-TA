import { describe, it, expect } from 'vitest';
import { loadAppConfig } from '@ai-tutor/adapters';
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
    expect(geminiConfig.model.classifierModel).toBe('gemini-3.8-flash');
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
    // Set course to logistics_only
    const putRes = await server.inject({
      method: 'PUT',
      url: '/api/courses/sdi-ftt101/settings',
      payload: { setting: 'logistics_only' },
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
    expect(chatRes.body).toContain('configured this tutor for course logistics only');

    // Reset back to full
    await server.inject({
      method: 'PUT',
      url: '/api/courses/sdi-ftt101/settings',
      payload: { setting: 'full' },
    });
  });

  it('supports "clear my data" student opt-out endpoint', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/users/user-1001/data',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('supports one-command demo reset endpoint (plan Phase 5)', async () => {
    // 1. Alter setting to logistics_only
    await server.inject({
      method: 'PUT',
      url: '/api/courses/sdi-ftt101/settings',
      payload: { setting: 'logistics_only' },
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
        },
        payload: {
          personaId: 'demo_instructor',
          courseId: 'sdi-ftt101',
          message: 'Draft an announcement.',
        },
      });

      expect(cfRes.statusCode).toBe(200);
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
  });
});
