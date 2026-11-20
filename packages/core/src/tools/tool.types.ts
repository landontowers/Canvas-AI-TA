import { z } from 'zod';
import { AssistantRole } from '../types/role.js';
import { LmsPort } from '../ports/lms.port.js';
import { CalculatorPort } from '../ports/calculator.port.js';
import { CourseContentPort } from '../ports/course-content.port.js';

export interface ToolExecutionContext {
  userId: string;
  canvasUserId: string;
  courseId: string;
  role: AssistantRole;
  ports: {
    lms: LmsPort;
    calculator: CalculatorPort;
    courseContent?: CourseContentPort;
  };
}

export class UnauthorizedToolError extends Error {
  constructor(toolName: string, requiredRole: string, currentRole: AssistantRole) {
    super(
      `Access Denied: Tool '${toolName}' requires role '${requiredRole}', but session role is '${currentRole}'.`,
    );
    this.name = 'UnauthorizedToolError';
  }
}

export interface CoreTool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<TArgs>;
  requiredRole: 'student' | 'instructor' | 'both';
  requiredScopes: string[];
  execute(args: TArgs, context: ToolExecutionContext): Promise<TResult>;
}
