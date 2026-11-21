import crypto from 'node:crypto';
import { z } from 'zod';
import { CourseSettingValueSchema } from '@virtual-ta/core';

export const LoginBodySchema = z
  .object({
    password: z.string().optional(),
    email: z.string().optional(),
  })
  .default({});

export const ToolExecuteBodySchema = z.object({
  personaId: z.string().optional(),
  courseId: z.string().optional(),
  toolName: z.string().min(1),
  args: z.record(z.unknown()).optional(),
});

export const CourseSettingsPutBodySchema = z.object({
  setting: CourseSettingValueSchema,
  blackoutStart: z.string().datetime().nullable().optional(),
  blackoutEnd: z.string().datetime().nullable().optional(),
  personaId: z.string().optional(),
});

export const FeedbackBodySchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  courseId: z.string().optional(),
  rating: z.enum(['up', 'down']),
  personaId: z.string().optional(),
});

export const CrisisStatusPatchBodySchema = z.object({
  status: z.enum(['new', 'acknowledged', 'resolved']),
  personaId: z.string().optional(),
});

export const PracticeCheckBodySchema = z.object({
  courseId: z.string().optional(),
  personaId: z.string().optional(),
  topic: z.string().max(200).optional(),
});

export const UserLearningContextPutBodySchema = z.object({
  preferredStyle: z.string().trim().max(150).nullable().optional(),
  recurringTopics: z.array(z.string().trim().min(1).max(100)).max(8).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  personaId: z.string().optional(),
});

export const ChatBodySchema = z.object({
  personaId: z.string().optional(),
  courseId: z.string().optional(),
  conversationId: z.string().optional(),
  message: z
    .string()
    .trim()
    .min(1, 'message is required')
    .max(8000, 'message exceeds maximum length of 8000 characters'),
  pageContext: z
    .object({
      title: z.string().max(500).optional(),
      url: z.string().max(2000).optional(),
      content: z.string().max(8000).optional(),
    })
    .optional(),
});

export const LtiLoginParamsSchema = z.object({
  iss: z.string().min(1, 'iss is required'),
  login_hint: z.string().min(1, 'login_hint is required'),
  target_link_uri: z.string().optional(),
  lti_message_hint: z.string().optional(),
  client_id: z.string().optional(),
});

export const LtiLaunchBodySchema = z.object({
  id_token: z.string().min(1, 'id_token is required'),
  state: z.string().optional(),
});

export const RetentionPurgeBodySchema = z
  .object({
    retentionDays: z.number().int().positive().optional(),
    personaId: z.string().optional(),
  })
  .default({});

export function safeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
