import { describe, it, expect } from 'vitest';
import { CanvasClient } from '../canvas/canvas-client.js';
import { CanvasDemoIdentityAdapter } from '../canvas/canvas-demo-identity.adapter.js';
import { createSandboxFetch } from '../fixtures/sandbox-course.fixture.js';
import { SDI_DEMO_PERSONAS } from '../config/sdi.config.js';

describe('CanvasDemoIdentityAdapter', () => {
  const client = new CanvasClient({
    baseUrl: 'https://classroom.sdi.edu',
    accessToken: 'test-token',
    fetchFn: createSandboxFetch(),
    cacheTtlMs: 0,
  });

  const adapter = new CanvasDemoIdentityAdapter({
    client,
    allowedPersonas: SDI_DEMO_PERSONAS,
    collegeId: 'sdi',
  });

  it('resolves demo_student to student Virtual TA role', async () => {
    const context = await adapter.resolveIdentity({ personaId: 'demo_student', courseId: '101' });

    expect(context.assistantRole).toBe('student');
    expect(context.canvasUserId).toBe('1001');
    expect(context.collegeId).toBe('sdi');
    expect(context.roles).toContain('Learner');
  });

  it('resolves demo_instructor to instructor Virtual TA role', async () => {
    const context = await adapter.resolveIdentity({ personaId: 'demo_instructor', courseId: '101' });

    expect(context.assistantRole).toBe('instructor');
    expect(context.canvasUserId).toBe('2001');
    expect(context.roles).toContain('Instructor');
  });

  it('resolves demo_ta with mixed roles to instructor Virtual TA role per fixed rule (critique §3.14)', async () => {
    const context = await adapter.resolveIdentity({ personaId: 'demo_ta', courseId: '101' });

    expect(context.assistantRole).toBe('instructor');
    expect(context.canvasUserId).toBe('3001');
    expect(context.roles).toContain('TeachingAssistant');
  });

  it('rejects unallowlisted persona IDs with an unauthorized error', async () => {
    await expect(
      adapter.resolveIdentity({ personaId: 'random_user_999', courseId: '101' }),
    ).rejects.toThrow(/Unauthorized: Persona.*allowlist/i);
  });
});
