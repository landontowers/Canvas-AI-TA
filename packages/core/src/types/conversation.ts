import { z } from 'zod';
import { AssistantRoleSchema } from './role.js';
import { ScaffoldingStateSchema } from '../policy/hint-ladder.js';

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  collegeId: z.string(),
  courseId: z.string(),
  userId: z.string(),
  role: AssistantRoleSchema,
  title: z.string().optional(),
  messageCount: z.number().int().nonnegative().optional(),
  scaffoldingState: ScaffoldingStateSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Conversation = z.infer<typeof ConversationSchema>;
