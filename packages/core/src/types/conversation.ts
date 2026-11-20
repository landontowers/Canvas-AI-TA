import { z } from 'zod';
import { TutorRoleSchema } from './role.js';
import { TutoringStateSchema } from '../policy/hint-ladder.js';

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  collegeId: z.string(),
  courseId: z.string(),
  userId: z.string(),
  role: TutorRoleSchema,
  title: z.string().optional(),
  messageCount: z.number().int().nonnegative().optional(),
  tutoringState: TutoringStateSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Conversation = z.infer<typeof ConversationSchema>;
