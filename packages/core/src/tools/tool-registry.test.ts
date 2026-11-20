import { describe, it, expect } from 'vitest';
import { ToolRegistry } from './tool-registry.js';
import { CoreTool, UnauthorizedToolError } from './tool.types.js';
import { z } from 'zod';

describe('ToolRegistry Unit Tests', () => {
  it('registers and retrieves tools by name', () => {
    const registry = new ToolRegistry();
    const tool: CoreTool<{ id: string }, string> = {
      name: 'test_tool',
      description: 'A test tool',
      parameters: z.object({ id: z.string() }),
      requiredRole: 'both',
      requiredScopes: [],
      execute: async (args) => `Result for ${args.id}`,
    };

    registry.register(tool);
    expect(registry.get('test_tool')).toBe(tool);
    expect(registry.get('non_existent')).toBeUndefined();
  });

  it('filters tools by role strictly', () => {
    const registry = new ToolRegistry();

    const studentTool: CoreTool<any, any> = {
      name: 'student_calc',
      description: 'Calculator',
      parameters: z.object({}),
      requiredRole: 'student',
      requiredScopes: [],
      execute: async () => 'calc',
    };
    const instructorTool: CoreTool<any, any> = {
      name: 'instructor_submissions',
      description: 'Submissions',
      parameters: z.object({}),
      requiredRole: 'instructor',
      requiredScopes: [],
      execute: async () => 'subs',
    };
    const bothTool: CoreTool<any, any> = {
      name: 'both_syllabus',
      description: 'Syllabus',
      parameters: z.object({}),
      requiredRole: 'both',
      requiredScopes: [],
      execute: async () => 'syl',
    };

    registry.register(studentTool);
    registry.register(instructorTool);
    registry.register(bothTool);

    const studentTools = registry.getToolsForRole('student');
    const instructorTools = registry.getToolsForRole('instructor');

    expect(studentTools.map((t) => t.name)).toEqual(['student_calc', 'both_syllabus']);
    expect(instructorTools.map((t) => t.name)).toEqual(['instructor_submissions', 'both_syllabus']);
  });

  it('executes a tool successfully with valid parameters', async () => {
    const registry = new ToolRegistry();
    const tool: CoreTool<{ x: number; y: number }, number> = {
      name: 'add',
      description: 'Add numbers',
      parameters: z.object({ x: z.number(), y: z.number() }),
      requiredRole: 'both',
      requiredScopes: [],
      execute: async ({ x, y }) => x + y,
    };
    registry.register(tool);

    const result = await registry.execute(
      { id: 'c1', name: 'add', args: { x: 5, y: 7 } },
      { role: 'student', courseId: 'c1', userId: 'u1' } as any,
    );

    expect(result.isError).toBe(false);
    expect(result.result).toBe(12);
  });

  it('returns isError when tool is not found', async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute(
      { id: 'c2', name: 'missing_tool', args: {} },
      { role: 'student', courseId: 'c1', userId: 'u1' } as any,
    );

    expect(result.isError).toBe(true);
    expect(result.result).toContain("Tool 'missing_tool' not found");
  });

  it('throws UnauthorizedToolError when role boundary is violated', async () => {
    const registry = new ToolRegistry();
    const instructorOnly: CoreTool<any, any> = {
      name: 'gradebook_summary',
      description: 'Gradebook',
      parameters: z.object({}),
      requiredRole: 'instructor',
      requiredScopes: [],
      execute: async () => 'grades',
    };
    registry.register(instructorOnly);

    await expect(
      registry.execute(
        { id: 'c3', name: 'gradebook_summary', args: {} },
        { role: 'student', courseId: 'c1', userId: 'u1' } as any,
      ),
    ).rejects.toThrow(UnauthorizedToolError);
  });

  it('returns isError when tool arguments fail zod validation', async () => {
    const registry = new ToolRegistry();
    const tool: CoreTool<{ email: string }, string> = {
      name: 'email_tool',
      description: 'Email tool',
      parameters: z.object({ email: z.string().email() }),
      requiredRole: 'both',
      requiredScopes: [],
      execute: async (args) => args.email,
    };
    registry.register(tool);

    const result = await registry.execute(
      { id: 'c4', name: 'email_tool', args: { email: 'invalid-email' } },
      { role: 'student', courseId: 'c1', userId: 'u1' } as any,
    );

    expect(result.isError).toBe(true);
    expect(result.result).toContain('Invalid tool arguments');
  });

  it('catches and returns execution runtime errors gracefully', async () => {
    const registry = new ToolRegistry();
    const failingTool: CoreTool<any, any> = {
      name: 'failing_tool',
      description: 'Fails',
      parameters: z.object({}),
      requiredRole: 'both',
      requiredScopes: [],
      execute: async () => {
        throw new Error('Database connection failed');
      },
    };
    registry.register(failingTool);

    const result = await registry.execute(
      { id: 'c5', name: 'failing_tool', args: {} },
      { role: 'student', courseId: 'c1', userId: 'u1' } as any,
    );

    expect(result.isError).toBe(true);
    expect(result.result).toBe('Database connection failed');
  });
});
