import { z } from 'zod';

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  name: z.string(),
  result: z.unknown(),
  isError: z.boolean().optional(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType<unknown>;
  requiredRole: 'student' | 'instructor' | 'both';
  requiredScopes: string[];
}
