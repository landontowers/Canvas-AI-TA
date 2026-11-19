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
});
