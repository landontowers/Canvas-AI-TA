import { z } from 'zod';
import { AssistantRoleSchema } from './role.js';

export const UserSchema = z.object({
  id: z.string().uuid(),
  collegeId: z.string(),
  externalCanvasId: z.string(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: AssistantRoleSchema,
  createdAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
