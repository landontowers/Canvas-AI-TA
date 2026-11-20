import { describe, it, expect } from 'vitest';
import {
  CrisisEventSchema,
  UsageEventSchema,
  StreamEvent,
  StreamEventSchema,
  toClientStreamEvent,
} from './stream.js';

describe('StreamEvent & toClientStreamEvent', () => {
  it('validates typed CrisisEvent payloads', () => {
    const crisis: StreamEvent = {
      type: 'crisis',
      hotlineName: '988 Suicide & Crisis Lifeline',
      phone: '988',
      sms: '988',
      url: 'https://988lifeline.org',
      message: 'Help is available 24/7.',
    };

    expect(CrisisEventSchema.parse(crisis)).toEqual(crisis);
    expect(StreamEventSchema.parse(crisis)).toEqual(crisis);
  });

  it('validates typed UsageEvent payloads', () => {
    const usage: StreamEvent = {
      type: 'usage',
      promptTokens: 120,
      completionTokens: 45,
      totalTokens: 175,
      thoughtsTokens: 10,
    };

    expect(UsageEventSchema.parse(usage)).toEqual(usage);
    expect(StreamEventSchema.parse(usage)).toEqual(usage);
  });

  it('strips internal args, callId, and thoughtSignature from tool-status events', () => {
    const internalEvent: StreamEvent = {
      type: 'tool-status',
      toolName: 'get_syllabus',
      status: 'calling',
      args: { secretInternalArg: '123' },
      callId: 'call_abc',
      thoughtSignature: 'sig_opaque_model_state',
      message: 'Checking syllabus...',
    };

    const sanitized = toClientStreamEvent(internalEvent);
    expect(sanitized).toEqual({
      type: 'tool-status',
      toolName: 'get_syllabus',
      status: 'calling',
      message: 'Checking syllabus...',
    });
    expect('args' in sanitized).toBe(false);
    expect('callId' in sanitized).toBe(false);
    expect('thoughtSignature' in sanitized).toBe(false);
  });

  it('passes through non-tool-status events intact', () => {
    const textEv: StreamEvent = { type: 'text-delta', delta: 'Hello' };
    const citeEv: StreamEvent = {
      type: 'citation',
      citation: {
        title: 'Course Syllabus',
        url: 'https://classroom.sdi.edu/courses/101/syllabus',
        type: 'syllabus',
      },
    };
    const doneEv: StreamEvent = {
      type: 'done',
      conversationId: 'conv-1',
      messageId: 'msg-1',
    };

    expect(toClientStreamEvent(textEv)).toEqual(textEv);
    expect(toClientStreamEvent(citeEv)).toEqual(citeEv);
    expect(toClientStreamEvent(doneEv)).toEqual(doneEv);
  });
});
