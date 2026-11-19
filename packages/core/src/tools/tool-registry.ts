import { CoreTool, ToolExecutionContext, UnauthorizedToolError } from './tool.types.js';
import { ToolDefinition, ToolCall, ToolResult } from '../types/tool.js';
import { TutorRole } from '../types/role.js';

export class ToolRegistry {
  private tools = new Map<string, CoreTool<unknown, unknown>>();

  register<TArgs, TResult>(tool: CoreTool<TArgs, TResult>): void {
    this.tools.set(tool.name, tool as unknown as CoreTool<unknown, unknown>);
  }

  get(name: string): CoreTool<unknown, unknown> | undefined {
    return this.tools.get(name);
  }

  /**
   * Returns tool definitions filtered for the given session role (critique §3.14).
   * Student sessions are never offered instructor tools.
   */
  getToolsForRole(role: TutorRole): ToolDefinition[] {
    const list: ToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      if (tool.requiredRole === 'both' || tool.requiredRole === role) {
        list.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          requiredRole: tool.requiredRole,
          requiredScopes: tool.requiredScopes,
        });
      }
    }
    return list;
  }

  /**
   * Executes a tool call with strict role-based access control.
   * If a student session attempts to invoke an instructor tool, it is strictly rejected.
   */
  async execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return {
        toolCallId: call.id,
        name: call.name,
        result: `Tool '${call.name}' not found.`,
        isError: true,
      };
    }

    // Server-enforced role boundary (critique §3.14, critique §8)
    if (tool.requiredRole !== 'both' && tool.requiredRole !== context.role) {
      throw new UnauthorizedToolError(tool.name, tool.requiredRole, context.role);
    }

    // Validate parameters with runtime schema
    const parsed = tool.parameters.safeParse(call.args);
    if (!parsed.success) {
      return {
        toolCallId: call.id,
        name: call.name,
        result: `Invalid tool arguments: ${parsed.error.message}`,
        isError: true,
      };
    }

    try {
      const result = await tool.execute(parsed.data, context);
      return {
        toolCallId: call.id,
        name: call.name,
        result,
        isError: false,
      };
    } catch (err: unknown) {
      return {
        toolCallId: call.id,
        name: call.name,
        result: err instanceof Error ? err.message : String(err),
        isError: true,
      };
    }
  }
}
