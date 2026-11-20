import { z } from 'zod';
import { CitationSchema } from './message.js';

/**
 * Server-Sent Events (SSE) schemas for streaming AI responses (critique §3.8).
 */
export const TextDeltaEventSchema = z.object({
  type: z.literal('text-delta'),
  delta: z.string(),
});

export const ToolStatusEventSchema = z.object({
  type: z.literal('tool-status'),
  toolName: z.string(),
  status: z.enum(['calling', 'executing', 'complete', 'error']),
  args: z.record(z.unknown()).optional(),
  callId: z.string().optional(),
  thoughtSignature: z.string().optional(),
  message: z.string().optional(),
});

export const CitationEventSchema = z.object({
  type: z.literal('citation'),
  citation: CitationSchema,
});

export const DoneEventSchema = z.object({
  type: z.literal('done'),
  conversationId: z.string(),
  messageId: z.string(),
});

export const ErrorEventSchema = z.object({
  type: z.literal('error'),
  error: z.string(),
  code: z.string().optional(),
});

export const CrisisEventSchema = z.object({
  type: z.literal('crisis'),
  hotlineName: z.string(),
  phone: z.string(),
  sms: z.string().optional(),
  url: z.string().url(),
  message: z.string(),
});

export const StreamEventSchema = z.discriminatedUnion('type', [
  TextDeltaEventSchema,
  ToolStatusEventSchema,
  CitationEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
  CrisisEventSchema,
]);

export type StreamEvent = z.infer<typeof StreamEventSchema>;
export type TextDeltaEvent = z.infer<typeof TextDeltaEventSchema>;
export type ToolStatusEvent = z.infer<typeof ToolStatusEventSchema>;
export type CitationEvent = z.infer<typeof CitationEventSchema>;
export type DoneEvent = z.infer<typeof DoneEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type CrisisEvent = z.infer<typeof CrisisEventSchema>;

/**
 * Strips internal LLM protocol fields (raw args, callId, thoughtSignature) before
 * sending stream events to browser clients over SSE.
 */
export function toClientStreamEvent(event: StreamEvent): StreamEvent {
  if (event.type === 'tool-status') {
    return {
      type: 'tool-status',
      toolName: event.toolName,
      status: event.status,
      ...(event.message !== undefined ? { message: event.message } : {}),
    };
  }
  return event;
}
