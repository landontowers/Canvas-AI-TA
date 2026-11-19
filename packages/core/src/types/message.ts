import { z } from 'zod';

export const CitationSchema = z.object({
  title: z.string(),
  url: z.string(),
  canvasId: z.string().optional(),
  type: z.enum(['assignment', 'page', 'syllabus', 'announcement', 'module', 'external']),
});

export type Citation = z.infer<typeof CitationSchema>;

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.string(),
  citations: z.array(CitationSchema).default([]),
  createdAt: z.date(),
});

export type Message = z.infer<typeof MessageSchema>;
