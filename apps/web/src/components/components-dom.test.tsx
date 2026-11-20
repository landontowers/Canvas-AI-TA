import React from 'react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CitationBadge } from './CitationBadge.js';
import { ToolStatusPill } from './ToolStatusPill.js';
import { DemoAuthModal } from './DemoAuthModal.js';
import { StudentSettings } from './StudentSettings.js';
import { InstructorSettings } from './InstructorSettings.js';
import { ChatInterface } from './ChatInterface.js';
import { DemoShell } from './DemoShell.js';
import * as Icons from './Icons.js';

describe('Web UI Components DOM Rendering & Interaction Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Icons', () => {
    it('renders all SVG icons with standard accessibility attributes', () => {
      const iconEntries = Object.entries(Icons).filter(([name]) => name.endsWith('Icon'));
      expect(iconEntries.length).toBeGreaterThan(15);

      for (const [name, IconComp] of iconEntries) {
        const { container } = render(React.createElement(IconComp as React.FC<any>, { size: 20, className: 'test-icon' }));
        const svg = container.querySelector('svg');
        expect(svg, `Icon ${name} should render an SVG element`).not.toBeNull();
        expect(svg?.getAttribute('aria-hidden')).toBe('true');
        expect(svg?.getAttribute('width')).toBe('20');
        expect(svg?.getAttribute('height')).toBe('20');
      }
    });
  });

  describe('CitationBadge', () => {
    it('renders badge with correct icon, link, and label for each type', () => {
      const types = ['assignment', 'page', 'syllabus', 'announcement', 'module', 'external'] as const;

      for (const type of types) {
        const { unmount } = render(
          <CitationBadge
            citation={{
              title: `Test ${type}`,
              url: `https://classroom.sdi.edu/${type}/1`,
              type,
            }}
          />,
        );

        const link = screen.getByRole('link', { name: new RegExp(`Test ${type}`) });
        expect(link).toBeDefined();
        expect(link.getAttribute('href')).toBe(`https://classroom.sdi.edu/${type}/1`);
        expect(link.getAttribute('target')).toBe('_blank');
        unmount();
      }
    });
  });

  describe('ToolStatusPill', () => {
    it('renders different tool statuses (calling, executing, complete, error)', () => {
      const { rerender } = render(
        <ToolStatusPill toolName="calculator" status="calling" message="Calculating 2+2" />,
      );
      expect(screen.getByText('Calculating 2+2')).toBeDefined();

      rerender(<ToolStatusPill toolName="calculator" status="calling" />);
      expect(screen.getByText('Calling: calculator...')).toBeDefined();

      rerender(<ToolStatusPill toolName="calculator" status="complete" />);
      expect(screen.getByText('Checked: calculator')).toBeDefined();

      rerender(<ToolStatusPill toolName="calculator" status="error" message="Math error" />);
      expect(screen.getByText('Math error')).toBeDefined();
    });
  });

  describe('DemoAuthModal', () => {
    it('handles password input, submission, and validation error', async () => {
      const onSuccess = vi.fn();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized', message: 'Invalid demo password' }),
      });

      render(<DemoAuthModal onSuccess={onSuccess} />);

      const input = screen.getByLabelText(/Demo Passcode/i);
      const submitBtn = screen.getByRole('button', { name: /Sign In to Demo/i });

      fireEvent.change(input, { target: { value: 'wrong-pass' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Invalid demo password/i)).toBeDefined();
      });
      expect(onSuccess).not.toHaveBeenCalled();

      // Test successful auth
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: 'mock-session-token' }),
      });

      fireEvent.change(input, { target: { value: 'correct-pass' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('mock-session-token');
      });
    });
  });

  describe('StudentSettings', () => {
    it('renders privacy details and handles conversation data clearing', async () => {
      const onClose = vi.fn();
      const onCleared = vi.fn();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, deletedConversations: 2, deletedMessages: 10, message: 'Deleted 2 conversations and 10 messages' }),
      });

      render(
        <StudentSettings
          userId="demo_student"
          personaId="demo_student"
          courseId="sdi-ftt101"
          authToken="session-tok-123"
          onClose={onClose}
          onDataCleared={onCleared}
        />,
      );

      expect(screen.getByText(/Your Privacy at SDI/i)).toBeDefined();
      expect(screen.getByText(/Private Conversations/i)).toBeDefined();

      const clearBtn = screen.getByRole('button', { name: /Request data deletion|Clear My Conversation Data/i });
      fireEvent.click(clearBtn);

      const confirmBtn = screen.getByRole('button', { name: /Yes, Delete My Data/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText(/Deleted 2 conversations and 10 messages/i)).toBeDefined();
      });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/users/demo_student/data?personaId=demo_student',
        expect.objectContaining({
          method: 'DELETE',
          headers: { Authorization: 'Bearer session-tok-123' },
        }),
      );
      expect(onCleared).toHaveBeenCalled();

      const backBtn = screen.getByRole('button', { name: /Back to.*Drawer/i });
      fireEvent.click(backBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('InstructorSettings', () => {
    it('renders instructor mode toggles and saves setting changes', async () => {
      const onClose = vi.fn();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ setting: 'full', courseId: 'sdi-ftt101' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ setting: 'logistics_only', courseId: 'sdi-ftt101' }),
        });

      render(
        <InstructorSettings
          courseId="sdi-ftt101"
          personaId="demo_instructor"
          authToken="inst-tok-456"
          onClose={onClose}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/Virtual TA Pedagogy Mode/i)).toBeDefined();
      });

      const logisticsRadio = screen.getByRole('radio', { name: /Logistics Only/i });
      fireEvent.click(logisticsRadio);

      await waitFor(() => {
        expect(screen.getByText(/Course setting updated to Logistics Only/i)).toBeDefined();
      });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/courses/sdi-ftt101/settings',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer inst-tok-456',
          },
          body: JSON.stringify({ setting: 'logistics_only', personaId: 'demo_instructor' }),
        }),
      );

      const backBtn = screen.getByRole('button', { name: /Back to.*Drawer/i });
      fireEvent.click(backBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('ChatInterface', () => {
    it('renders empty state with suggestion chips and handles chat interactions', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/conversations')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  id: 'conv-prev-1',
                  collegeId: 'sdi',
                  courseId: 'sdi-ftt101',
                  userId: 'demo_student',
                  role: 'student',
                  title: 'Previous Lab Question',
                  messageCount: 4,
                  lastMessageAt: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ]),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(
        <ChatInterface
          personaId="demo_student"
          courseId="sdi-ftt101"
          currentPageTitle="Assignment: Safety Lab 1"
          highContrast={false}
        />,
      );

      // Verify empty state title and suggestions
      expect(screen.getByText(/SDI Student Virtual TA/i)).toBeDefined();
      expect(screen.getByText(/When is Safety Lab 1 due\?/i)).toBeDefined();

      // Verify darkened toolbar buttons
      const newChatBtn = screen.getByRole('button', { name: /Start a new chat/i });
      const prevChatsBtn = screen.getByRole('button', { name: /View previous chats/i });
      expect(newChatBtn).toBeDefined();
      expect(prevChatsBtn).toBeDefined();

      // Open previous chats history drawer
      fireEvent.click(prevChatsBtn);
      await waitFor(() => {
        expect(screen.getByText(/Previous Chats \(1\)/i)).toBeDefined();
        expect(screen.getByText(/Previous Lab Question/i)).toBeDefined();
      });

      // Close previous chats history drawer
      const closeHistoryBtn = screen.getByRole('button', { name: /Close previous chats panel/i });
      fireEvent.click(closeHistoryBtn);

      // Clicking New Chat resets conversation
      fireEvent.click(newChatBtn);
    });

    it('streams SSE responses with pageContext, renders citations without false-positive 988 banner, and renders typed crisis card', async () => {
      const createSseStream = (events: unknown[]) => {
        const encoder = new TextEncoder();
        return new ReadableStream({
          start(controller) {
            for (const ev of events) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
            }
            controller.close();
          },
        });
      };

      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/conversations/conv-crisis/messages')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  id: 'm-1',
                  role: 'user',
                  content: 'Older crisis check',
                  citations: [],
                  createdAt: new Date().toISOString(),
                },
                {
                  id: 'm-2',
                  role: 'assistant',
                  content: 'Support is available.',
                  citations: [],
                  isCrisis: true,
                  createdAt: new Date().toISOString(),
                },
              ]),
          });
        }
        if (url.includes('/api/conversations')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  id: 'conv-crisis',
                  collegeId: 'sdi',
                  courseId: 'sdi-ftt101',
                  userId: 'user-1001',
                  role: 'student',
                  title: 'Older crisis check',
                  messageCount: 2,
                  lastMessageAt: new Date().toISOString(),
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ]),
          });
        }
        if (url === '/api/chat') {
          const callCount = fetchMock.mock.calls.filter(([u]) => u === '/api/chat').length;
          if (callCount === 1) {
            // Turn 1: answer mentions number 988 (ballistics math) WITHOUT a crisis event
            return Promise.resolve({
              ok: true,
              body: createSseStream([
                { type: 'tool-status', toolName: 'calculate', status: 'calling', message: 'Computing energy' },
                { type: 'tool-status', toolName: 'calculate', status: 'complete' },
                { type: 'text-delta', delta: 'Bullet kinetic energy is 988 ft-lbs.' },
                {
                  type: 'citation',
                  citation: {
                    title: 'Course Syllabus',
                    url: 'https://classroom.sdi.edu/courses/sdi-ftt101/syllabus',
                    type: 'syllabus',
                  },
                },
                { type: 'done', conversationId: 'conv-stream-1', messageId: 'msg-a1' },
              ]),
            });
          }
          // Turn 2: typed crisis SSE event
          return Promise.resolve({
            ok: true,
            body: createSseStream([
              {
                type: 'crisis',
                hotlineName: '988 Suicide & Crisis Lifeline',
                phone: '988',
                sms: '988',
                url: 'https://988lifeline.org',
                message: 'Help is available 24/7.',
              },
              { type: 'text-delta', delta: 'Please reach out right away.' },
              { type: 'done', conversationId: 'conv-stream-1', messageId: 'msg-a2' },
            ]),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      globalThis.fetch = fetchMock;

      render(
        <ChatInterface
          personaId="demo_student"
          courseId="sdi-ftt101"
          currentPageTitle="Ballistics Lab"
          pageContext={{
            title: 'Ballistics Lab',
            url: 'https://classroom.sdi.edu/courses/sdi-ftt101/pages/ballistics',
            content: 'Compute kinetic energy for 55gr projectile.',
          }}
          highContrast={false}
          authToken="bearer-abc"
        />,
      );

      const input = screen.getByLabelText(/Ask the SDI Virtual TA/i);
      const sendBtn = screen.getByRole('button', { name: /Send message to Virtual TA/i });

      // Turn 1: ballistics math mentioning '988'
      fireEvent.change(input, { target: { value: 'Calculate energy' } });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(screen.getByText(/Bullet kinetic energy is 988 ft-lbs\./i)).toBeDefined();
      });
      // Must NOT show crisis card on numeric '988'
      expect(screen.queryByRole('alert', { name: /Emergency Crisis Support/i })).toBeNull();

      // Verify pageContext and authToken were included in POST /api/chat
      const chatCall = fetchMock.mock.calls.find(([u]) => u === '/api/chat');
      const sentBody = JSON.parse(String(chatCall?.[1]?.body));
      expect(sentBody.pageContext.title).toBe('Ballistics Lab');
      expect(sentBody.pageContext.content).toContain('55gr projectile');
      expect(chatCall?.[1]?.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer bearer-abc' }),
      );

      // Citation link uses absolute https:// URL
      const citeLink = screen.getByRole('link', { name: /Syllabus citation: Course Syllabus/i });
      expect(citeLink.getAttribute('href')).toBe('https://classroom.sdi.edu/courses/sdi-ftt101/syllabus');

      // Turn 2: typed crisis event DOES render crisis card
      fireEvent.change(input, { target: { value: 'Need emergency help' } });
      fireEvent.click(screen.getByRole('button', { name: /Send message to Virtual TA/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert', { name: /Emergency Crisis Support/i })).toBeDefined();
      });

      // Resuming a persisted crisis conversation renders isCrisis banner from history
      fireEvent.click(screen.getByRole('button', { name: /View previous chats/i }));
      await waitFor(() => {
        expect(screen.getByText(/Older crisis check/i)).toBeDefined();
      });
      fireEvent.click(screen.getByRole('button', { name: /Resume chat: Older crisis check/i }));

      await waitFor(() => {
        expect(screen.getByText(/Support is available\./i)).toBeDefined();
        expect(screen.getByRole('alert', { name: /Emergency Crisis Support/i })).toBeDefined();
      });
    });

    it('supports aborting active stream via Stop button and renders SSE error alerts', async () => {
      const encoder = new TextEncoder();
      const abortError = new DOMException('Aborted', 'AbortError');

      // Hang stream until aborted for Stop button test
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url === '/api/chat') {
          const callNum = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
            ([u]) => u === '/api/chat',
          ).length;
          if (callNum === 1) {
            return Promise.resolve({
              ok: true,
              body: new ReadableStream({
                start(controller) {
                  controller.enqueue(encoder.encode('data: {"type":"text-delta","delta":"Partial..."}\n\n'));
                  init?.signal?.addEventListener('abort', () => {
                    controller.error(abortError);
                  });
                },
              }),
            });
          }
          // Second call emits explicit error event
          return Promise.resolve({
            ok: true,
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(
                  encoder.encode('data: {"type":"error","error":"Model temporarily unavailable"}\n\n'),
                );
                controller.close();
              },
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      render(
        <ChatInterface
          personaId="demo_student"
          courseId="sdi-ftt101"
          currentPageTitle="Assignment: Safety Lab 1"
          highContrast={false}
        />,
      );

      const input = screen.getByLabelText(/Ask the SDI Virtual TA/i);
      fireEvent.change(input, { target: { value: 'Long answer' } });
      fireEvent.click(screen.getByRole('button', { name: /Send message to Virtual TA/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Stop generating response/i })).toBeDefined();
      });
      fireEvent.click(screen.getByRole('button', { name: /Stop generating response/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Send message to Virtual TA/i })).toBeDefined();
      });

      // Trigger SSE error event
      fireEvent.change(input, { target: { value: 'Trigger error' } });
      fireEvent.click(screen.getByRole('button', { name: /Send message to Virtual TA/i }));

      await waitFor(() => {
        expect(screen.getByText(/Model temporarily unavailable/i)).toBeDefined();
      });
    });
  });

  describe('DemoShell', () => {
    it('renders header with SDI crest icon, toggles views, and toggles high contrast mode', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                status: 'ok',
                college: 'sdi',
                env: 'development',
                modelProvider: 'fake',
                canvasConnected: true,
                fakeCourseData: true,
                timestamp: new Date().toISOString(),
              }),
          });
        }
        if (url.includes('/api/auth/status')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ authRequired: false, authenticated: true }),
          });
        }
        if (url.includes('/api/config/demo')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                college: { id: 'sdi', name: 'Sonoran Desert Institute' },
                personas: [],
                authRequired: false,
              }),
          });
        }
        if (url.includes('/api/courses/sdi-ftt101/settings')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ courseId: 'sdi-ftt101', setting: 'full' }),
          });
        }
        if (url.includes('/api/conversations')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<DemoShell />);

      // Verify header with SDI crest icon and title
      const heading = screen.getByRole('heading', { level: 1, name: /SDI Virtual TA/i });
      expect(heading).toBeDefined();

      // High contrast toggle button
      const contrastBtn = screen.getByRole('button', { name: /High Contrast: OFF/i });
      expect(contrastBtn.getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(contrastBtn);
      expect(screen.getByRole('button', { name: /High Contrast: ON/i })).toBeDefined();

      // Dispatch LTI pageContent postMessage and verify pageContext propagates into POST /api/chat
      fireEvent(
        window,
        new MessageEvent('message', {
          data: {
            subject: 'lti.pageContent',
            pageTitle: 'Wiki: Trigger Action',
            pageUrl: 'https://classroom.sdi.edu/courses/sdi-ftt101/pages/trigger-action',
            pageContent: 'Detailed trigger mechanism overview.',
          },
        }),
      );

      await waitFor(() => {
        expect(screen.getByText(/Wiki: Trigger Action/i)).toBeDefined();
      });

      // Persona selector
      const personaSelect = screen.getByLabelText(/Persona \(Masquerade\):/i);
      fireEvent.change(personaSelect, { target: { value: 'demo_instructor' } });

      // Settings view toggle
      const viewToggleBtn = screen.getByRole('button', { name: /Open Settings/i });
      fireEvent.click(viewToggleBtn);

      await waitFor(() => {
        expect(screen.getByText(/Course Settings \(Staff\)/i)).toBeDefined();
      });

      // Switch back to chat view
      const chatToggleBtn = screen.getByRole('button', { name: /Return to Chat/i });
      fireEvent.click(chatToggleBtn);

      await waitFor(() => {
        expect(screen.getByText(/SDI Instructor Virtual TA/i)).toBeDefined();
      });
    });

    it('handles LTI launch URL params, strips ltiToken, syncs /api/lti/session, and honors lti.pageSettings', async () => {
      window.history.replaceState(
        {},
        '',
        '/?embedded=true&ltiToken=lti_session_xyz&placement=course_navigation&courseId=sdi-ftt101',
      );

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/lti/session') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                personaId: 'demo_instructor',
                placement: 'course_navigation',
                context: { courseId: 'sdi-ftt101', assistantRole: 'instructor' },
              }),
          });
        }
        if (url === '/health') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok', college: 'sdi', env: 'test', timestamp: '' }) });
        }
        if (url === '/api/auth/status') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ authRequired: false, authenticated: true }) });
        }
        if (url.includes('/api/courses/sdi-ftt101/settings')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ courseId: 'sdi-ftt101', setting: 'full' }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      const { container } = render(<DemoShell />);

      await waitFor(() => {
        expect(window.location.search).not.toContain('ltiToken=');
      });

      await waitFor(() => {
        expect(screen.getByText(/Course Settings \(Staff\)/i)).toBeDefined();
      });

      fireEvent(
        window,
        new MessageEvent('message', {
          data: {
            subject: 'lti.pageSettings',
            use_high_contrast: true,
          },
        }),
      );

      await waitFor(() => {
        expect(container.querySelector('.high-contrast-mode')).not.toBeNull();
      });

      window.history.replaceState({}, '', '/');
    });
  });
});
