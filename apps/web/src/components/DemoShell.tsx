import React, { useState, useEffect } from 'react';
import { ChatInterface } from './ChatInterface.js';
import { InstructorSettings } from './InstructorSettings.js';
import { StudentSettings } from './StudentSettings.js';
import { DemoAuthModal } from './DemoAuthModal.js';
import { GearIcon, ChatBubbleIcon, EyeIcon, RefreshIcon } from './Icons.js';
import sdiShieldIcon from '../assets/sdi-shield-icon.png';

interface HealthStatus {
  status: string;
  college: string;
  env: string;
  modelProvider?: string;
  canvasConnected?: boolean;
  fakeCourseData?: boolean;
  timestamp: string;
}

const LTI_PLATFORM_STORAGE_KEY = 'virtual_ta_lti_token';

function readInitialSearchParams(): {
  ltiToken: string | null;
  placement: string | null;
  courseId: string | null;
} {
  if (typeof window === 'undefined') {
    return { ltiToken: null, placement: null, courseId: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    ltiToken: params.get('ltiToken'),
    placement: params.get('placement'),
    courseId: params.get('courseId'),
  };
}

export const DemoShell: React.FC = () => {
  const initialParams = readInitialSearchParams();

  const [persona, setPersona] = useState<string>('demo_student');
  const [courseId, setCourseId] = useState<string>(initialParams.courseId || 'sdi-ftt101');
  const [activePage, setActivePage] = useState<string>('Assignment: Safety Lab 1');
  const [activePageUrl, setActivePageUrl] = useState<string | undefined>(undefined);
  const [activePageContent, setActivePageContent] = useState<string | undefined>(undefined);
  const [chatResetKey, setChatResetKey] = useState<number>(0);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'chat' | 'settings'>(
    initialParams.placement === 'course_navigation' ? 'settings' : 'chat',
  );
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // Authentication & Hardening (critique §3.1, §4.3)
  const [authToken, setAuthToken] = useState<string | null>(() => {
    if (initialParams.ltiToken) return initialParams.ltiToken;
    return typeof window !== 'undefined' ? sessionStorage.getItem('demo_token') : null;
  });
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [authenticated, setAuthenticated] = useState<boolean>(true);
  const [resetting, setResetting] = useState<boolean>(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  const isStaff = persona === 'demo_instructor' || persona === 'demo_ta';

  const isEmbedded =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('embedded') === 'true' ||
      window.self !== window.top);

  useEffect(() => {
    if (isEmbedded) {
      document.body.classList.add('embedded-mode');
    } else {
      document.body.classList.remove('embedded-mode');
    }
  }, [isEmbedded]);

  // Scrub any transient LTI token from URL and store in Canvas Platform Storage when embedded (critique §3.1)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlLtiToken = params.get('ltiToken');
    if (urlLtiToken) {
      params.delete('ltiToken');
      const remaining = params.toString();
      const nextUrl = `${window.location.pathname}${remaining ? `?${remaining}` : ''}${window.location.hash}`;
      try {
        window.history.replaceState({}, '', nextUrl);
      } catch {
        // Ignore history restrictions in sandboxed environments
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { subject: 'lti.put_data', key: LTI_PLATFORM_STORAGE_KEY, value: urlLtiToken },
          '*',
        );
      }
    }
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      const data = event.data as Record<string, unknown>;
      if (data.type === 'canvas_context' || data.subject === 'lti.pageContent') {
        if (data.courseId || data.course_id) {
          setCourseId(String(data.courseId || data.course_id));
        }
        if (data.pageTitle || data.page_title) {
          setActivePage(String(data.pageTitle || data.page_title));
        }
        if (data.pageUrl || data.page_url || data.url) {
          setActivePageUrl(String(data.pageUrl || data.page_url || data.url));
        }
        if (data.pageContent || data.page_content || data.content || data.body) {
          setActivePageContent(
            String(data.pageContent || data.page_content || data.content || data.body),
          );
        }
        if (data.persona) {
          setPersona(String(data.persona));
        }
      } else if (
        data.subject === 'lti.pageSettings' ||
        data.subject === 'lti.getPageSettings.response' ||
        data.type === 'canvas_page_settings'
      ) {
        const highContrastSetting = data.use_high_contrast ?? data.useHighContrast;
        if (highContrastSetting !== undefined) {
          setHighContrast(Boolean(highContrastSetting));
        }
      } else if (
        (data.subject === 'lti.get_data.response' || data.subject === 'lti.get_data') &&
        data.key === LTI_PLATFORM_STORAGE_KEY &&
        typeof data.value === 'string' &&
        data.value.startsWith('lti_')
      ) {
        setAuthToken(data.value);
      }
    };

    window.addEventListener('message', handleMessage);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ subject: 'lti.getPageContent' }, '*');
      window.parent.postMessage({ subject: 'lti.getPageSettings' }, '*');
      if (!authToken || !authToken.startsWith('lti_')) {
        window.parent.postMessage({ subject: 'lti.get_data', key: LTI_PLATFORM_STORAGE_KEY }, '*');
      }
    }

    if (authToken && authToken.startsWith('lti_')) {
      fetch('/api/lti/session', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: {
              personaId?: string;
              placement?: string;
              context?: { courseId?: string };
            } | null,
          ) => {
            if (!data) return;
            if (data.personaId) {
              setPersona(data.personaId);
            }
            if (data.context?.courseId) {
              setCourseId(data.context.courseId);
            }
            if (data.placement === 'course_navigation') {
              setCurrentView('settings');
            }
            setAuthenticated(true);
          },
        )
        .catch(() => {});
    }

    fetch('/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: HealthStatus) => setHealth(data))
      .catch(() => {});

    // Check auth status
    fetch('/api/auth/status', {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then((res) => res.json())
      .then((data: { authRequired?: boolean; authenticated?: boolean }) => {
        setAuthRequired(Boolean(data.authRequired));
        setAuthenticated(Boolean(data.authenticated));
      })
      .catch(() => {});

    return () => window.removeEventListener('message', handleMessage);
  }, [authToken]);

  const handleLoginSuccess = (token: string) => {
    sessionStorage.setItem('demo_token', token);
    setAuthToken(token);
    setAuthenticated(true);
  };

  const handleDemoReset = async () => {
    setResetting(true);
    setResetFeedback(null);
    try {
      const res = await fetch('/api/demo/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResetFeedback('Reset complete: conversations cleared & course setting restored to Full.');
      setTimeout(() => setResetFeedback(null), 4000);
    } catch (err: unknown) {
      setResetFeedback(`Reset failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResetting(false);
    }
  };

  const handleToggleHighContrast = () => {
    setHighContrast((prev) => !prev);
  };

  const getPersonaLabel = () => {
    switch (persona) {
      case 'demo_student':
        return 'Student';
      case 'demo_instructor':
        return 'Instructor';
      case 'demo_ta':
        return 'Teaching Assistant';
      default:
        return 'User';
    }
  };

  return (
    <div
      className={`demo-container ${highContrast ? 'high-contrast-mode' : ''} ${
        isEmbedded ? 'embedded' : ''
      }`}
    >
      {/* Sign-in gate if demo authentication is required and user is unauthenticated */}
      {authRequired && !authenticated && (
        <DemoAuthModal onSuccess={handleLoginSuccess} />
      )}

      {/* External Demo Controls Bar (Simulates Canvas Host Environment) */}
      {!isEmbedded && (
        <aside className="demo-host-controls" aria-label="Demo Host Controls">
        <div className="demo-controls-header">
          <h2>Canvas Host Simulation</h2>
          <span className="demo-subtext">LTI 1.3 Sidebar Simulator</span>
        </div>

        <div className="control-row">
          <div className="control-field">
            <label htmlFor="persona-select">Persona (Masquerade):</label>
            <select
              id="persona-select"
              value={persona}
              onChange={(e) => {
                setPersona(e.target.value);
                setCurrentView('chat');
              }}
            >
              <option value="demo_student">Demo Student (Alex Chen)</option>
              <option value="demo_instructor">Demo Instructor (Prof. Elena Martinez)</option>
              <option value="demo_ta">Demo TA (Jordan Lee)</option>
            </select>
          </div>

          <div className="control-field">
            <label htmlFor="course-select">Active Course:</label>
            <select
              id="course-select"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="sdi-ftt101">FTT 101: Firearms Industry Fundamentals</option>
            </select>
          </div>

          <div className="control-field">
            <label htmlFor="current-page-select">Current Canvas Page (lti.getPageContent):</label>
            <select
              id="current-page-select"
              value={activePage}
              onChange={(e) => {
                setActivePage(e.target.value);
                setActivePageUrl(undefined);
                setActivePageContent(undefined);
              }}
            >
              <option value="Assignment: Safety Lab 1">Assignment: Safety Lab 1</option>
              <option value="Module 1: Firearm Safety & Nomenclature">Module 1: Firearm Safety & Nomenclature</option>
              <option value="Course Syllabus">Course Syllabus</option>
              <option value="Announcement: Welcome to FTT 101">Announcement: Welcome to FTT 101</option>
              <option value="Course Root / General">Course Root / General</option>
            </select>
          </div>

          <div className="control-field toggle-field">
            <button
              type="button"
              className={`contrast-toggle-btn ${highContrast ? 'active' : ''}`}
              onClick={handleToggleHighContrast}
              aria-pressed={highContrast}
            >
              <EyeIcon size={15} className="contrast-icon" />
              <span>{highContrast ? 'High Contrast: ON' : 'High Contrast: OFF'}</span>
            </button>
          </div>
        </div>

        <div className="demo-actions-row">
          <button
            type="button"
            className="demo-reset-btn"
            onClick={handleDemoReset}
            disabled={resetting}
            aria-label="Reset demo state and clear conversations"
          >
            {resetting ? (
              'Resetting...'
            ) : (
              <>
                <RefreshIcon size={12} className="btn-icon" />
                <span>Reset Demo State</span>
              </>
            )}
          </button>

          {resetFeedback && (
            <span className="reset-feedback-text" role="status">
              {resetFeedback}
            </span>
          )}
        </div>

        <div className="demo-meta-row">
          <div className="status-indicator-chip">
            <span className={`chip-dot ${health ? 'connected' : 'connecting'}`}></span>
            <span>
              API:{' '}
              {health
                ? `ONLINE (${health.college.toUpperCase()} • ${health.modelProvider || 'fake'}${
                    health.canvasConnected
                      ? health.fakeCourseData
                        ? ' • canvas-auth (fake-data)'
                        : ' • live-canvas'
                      : ''
                  })`
                : 'CONNECTING...'}
            </span>
          </div>
          <span className="frame-size-chip">Drawer: Resizable (Fluid)</span>
        </div>
      </aside>
      )}

      {/* Main Canvas Sidebar Drawer Frame */}
      <main className="canvas-frame" aria-label="SDI Virtual TA Canvas Sidebar Drawer">
        {/* Canvas Drawer Top Header */}
        <header className="sdi-header">
          <div className="sdi-brand">
            <img
              src={sdiShieldIcon}
              alt=""
              aria-hidden="true"
              className="sdi-header-logo"
              width="22"
              height="22"
            />
            <h1>SDI Virtual TA</h1>
          </div>

          <div className="header-actions">
            <span className="sdi-pill" aria-label={`Current Role: ${getPersonaLabel()}`}>
              {getPersonaLabel()}
            </span>

            <button
              type="button"
              className="view-toggle-btn"
              onClick={() => setCurrentView((prev) => (prev === 'chat' ? 'settings' : 'chat'))}
              aria-label={currentView === 'chat' ? 'Open Settings' : 'Return to Chat'}
              title={currentView === 'chat' ? 'Settings' : 'Chat'}
            >
              {currentView === 'chat' ? <GearIcon size={16} /> : <ChatBubbleIcon size={16} />}
            </button>
          </div>
        </header>

        {/* Drawer Body: Either Chat or Settings */}
        <div className="drawer-body">
          {currentView === 'chat' ? (
            <ChatInterface
              key={chatResetKey}
              personaId={persona}
              courseId={courseId}
              currentPageTitle={activePage}
              pageContext={{
                title: activePage,
                url: activePageUrl,
                content: activePageContent,
              }}
              highContrast={highContrast}
              authToken={authToken}
            />
          ) : isStaff ? (
            <InstructorSettings
              courseId={courseId}
              personaId={persona}
              authToken={authToken}
              onClose={() => setCurrentView('chat')}
            />
          ) : (
            <StudentSettings
              userId={persona}
              personaId={persona}
              courseId={courseId}
              authToken={authToken}
              onDataCleared={() => setChatResetKey((k) => k + 1)}
              onClose={() => setCurrentView('chat')}
            />
          )}
        </div>

        {/* Canvas Drawer Footer */}
        <footer className="sidebar-footer">
          <p>Sonoran Desert Institute • Canvas Sidebar Drawer</p>
        </footer>
      </main>
    </div>
  );
};
