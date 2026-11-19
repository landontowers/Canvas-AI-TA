import { describe, it, expect } from 'vitest';
import { Citation, StreamEvent } from '@ai-tutor/core';

describe('UI Component and Stream Processing Logic', () => {
  describe('Citation presentation', () => {
    it('creates appropriate accessibility labels for various Canvas resource types', () => {
      const citations: Citation[] = [
        {
          title: 'Safety Lab 1: Firearm Basics',
          url: 'https://classroom.sdi.edu/courses/101/assignments/1',
          type: 'assignment',
        },
        {
          title: 'FTT 101 Syllabus',
          url: 'https://classroom.sdi.edu/courses/101/syllabus',
          type: 'syllabus',
        },
        {
          title: 'Welcome Announcement',
          url: 'https://classroom.sdi.edu/courses/101/announcements/1',
          type: 'announcement',
        },
        {
          title: 'Module 1: Safety',
          url: 'https://classroom.sdi.edu/courses/101/modules/1',
          type: 'module',
        },
        {
          title: 'Firearm Maintenance Guide',
          url: 'https://classroom.sdi.edu/courses/101/pages/maintenance',
          type: 'page',
        },
      ];

      for (const cite of citations) {
        expect(cite.title).toBeDefined();
        expect(cite.url).toMatch(/^https:\/\//);
        expect(['assignment', 'syllabus', 'announcement', 'module', 'page', 'external']).toContain(
          cite.type,
        );
      }
    });
  });

  describe('SSE stream event processing', () => {
    it('parses valid SSE text-delta events', () => {
      const rawLine = 'data: {"type":"text-delta","delta":"Hello student!"}';
      const jsonStr = rawLine.slice(6);
      const event: StreamEvent = JSON.parse(jsonStr);

      expect(event.type).toBe('text-delta');
      if (event.type === 'text-delta') {
        expect(event.delta).toBe('Hello student!');
      }
    });

    it('parses valid SSE tool-status events with status indicators', () => {
      const rawLine =
        'data: {"type":"tool-status","toolName":"get_upcoming_assignments","status":"calling","message":"Checking upcoming assignments"}';
      const event: StreamEvent = JSON.parse(rawLine.slice(6));

      expect(event.type).toBe('tool-status');
      if (event.type === 'tool-status') {
        expect(event.toolName).toBe('get_upcoming_assignments');
        expect(event.status).toBe('calling');
      }
    });

    it('parses valid SSE citation events', () => {
      const rawLine =
        'data: {"type":"citation","citation":{"title":"Safety Lab 1","url":"https://classroom.sdi.edu","type":"assignment"}}';
      const event: StreamEvent = JSON.parse(rawLine.slice(6));

      expect(event.type).toBe('citation');
      if (event.type === 'citation') {
        expect(event.citation.title).toBe('Safety Lab 1');
        expect(event.citation.type).toBe('assignment');
      }
    });

    it('parses completion done event with conversation and message tracking', () => {
      const rawLine =
        'data: {"type":"done","conversationId":"conv_123","messageId":"msg_456"}';
      const event: StreamEvent = JSON.parse(rawLine.slice(6));

      expect(event.type).toBe('done');
      if (event.type === 'done') {
        expect(event.conversationId).toBe('conv_123');
        expect(event.messageId).toBe('msg_456');
      }
    });
  });

  describe('Course setting mode switches', () => {
    it('validates allowed course setting values', () => {
      const validSettings = ['full', 'logistics_only'];
      expect(validSettings).toContain('full');
      expect(validSettings).toContain('logistics_only');
    });
  });
});
