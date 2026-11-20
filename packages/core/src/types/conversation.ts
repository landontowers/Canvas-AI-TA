import { z } from 'zod';
import { TutorRoleSchema } from './role.js';

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  collegeId: z.string(),
  courseId: z.string(),
  userId: z.string(),
  role: TutorRoleSchema,
  title: z.string().optional(),
  messageCount: z.number().int().nonnegative().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Conversation = z.infer<typeof ConversationSchema>;
