import { describe, it, expect } from 'vitest';
import { loadAppConfig } from '@ai-tutor/adapters';
import { buildServer } from '../src/server.js';

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
});
