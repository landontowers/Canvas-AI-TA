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
          userId="student_1"
          courseId="sdi-ftt101"
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
          onClose={onClose}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/AI Tutor Pedagogy Mode/i)).toBeDefined();
      });

      const logisticsRadio = screen.getByRole('radio', { name: /Logistics Only/i });
      fireEvent.click(logisticsRadio);

      await waitFor(() => {
        expect(screen.getByText(/Course setting updated to Logistics Only/i)).toBeDefined();
      });

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
      expect(screen.getByText(/SDI Student AI Tutor/i)).toBeDefined();
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
      const heading = screen.getByRole('heading', { level: 1, name: /SDI AI Tutor/i });
      expect(heading).toBeDefined();

      // High contrast toggle button
      const contrastBtn = screen.getByRole('button', { name: /High Contrast: OFF/i });
      expect(contrastBtn.getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(contrastBtn);
      expect(screen.getByRole('button', { name: /High Contrast: ON/i })).toBeDefined();

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
        expect(screen.getByText(/SDI Instructor Assistant/i)).toBeDefined();
      });
    });
  });
});
