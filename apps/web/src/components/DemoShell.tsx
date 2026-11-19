import React, { useState, useEffect } from 'react';
import { ChatInterface } from './ChatInterface.js';
import { InstructorSettings } from './InstructorSettings.js';
import { StudentSettings } from './StudentSettings.js';
import { DemoAuthModal } from './DemoAuthModal.js';

interface HealthStatus {
  status: string;
  college: string;
  env: string;
  timestamp: string;
}

export const DemoShell: React.FC = () => {
  const [persona, setPersona] = useState<string>('demo_student');
  const [courseId, setCourseId] = useState<string>('sdi-ftt101');
  const [activePage, setActivePage] = useState<string>('Assignment: Safety Lab 1');
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'chat' | 'settings'>('chat');
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // Authentication & Hardening (critique §4.3)
  const [authToken, setAuthToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? sessionStorage.getItem('demo_token') : null;
  });
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [authenticated, setAuthenticated] = useState<boolean>(true);
  const [resetting, setResetting] = useState<boolean>(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  const isStaff = persona === 'demo_instructor' || persona === 'demo_ta';

  useEffect(() => {
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
    <div className={`demo-container ${highContrast ? 'high-contrast-mode' : ''}`}>
      {/* Sign-in gate if demo authentication is required and user is unauthenticated */}
      {authRequired && !authenticated && (
        <DemoAuthModal onSuccess={handleLoginSuccess} />
      )}

      {/* External Demo Controls Bar (Simulates Canvas Host Environment) */}
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
              onChange={(e) => setActivePage(e.target.value)}
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
              <span className="contrast-icon" aria-hidden="true">👁</span>
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
            {resetting ? 'Resetting...' : '🔄 Reset Demo State'}
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
            <span>API: {health ? `ONLINE (${health.college.toUpperCase()})` : 'CONNECTING...'}</span>
          </div>
          <span className="frame-size-chip">Drawer Width: 320px fixed</span>
        </div>
      </aside>

      {/* Main 320px Canvas Sidebar Drawer Frame */}
      <main className="canvas-frame" aria-label="SDI AI Tutor Canvas Sidebar Drawer">
        {/* Canvas Drawer Top Header */}
        <header className="sdi-header">
          <div className="sdi-brand">
            <span className="sdi-logo-square" aria-hidden="true"></span>
            <h1>SDI AI Tutor</h1>
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
              {currentView === 'chat' ? '⚙️' : '💬'}
            </button>
          </div>
        </header>

        {/* Drawer Body: Either Chat or Settings */}
        <div className="drawer-body">
          {currentView === 'chat' ? (
            <ChatInterface
              personaId={persona}
              courseId={courseId}
              currentPageTitle={activePage}
              highContrast={highContrast}
              authToken={authToken}
            />
          ) : isStaff ? (
            <InstructorSettings
              courseId={courseId}
              personaId={persona}
              onClose={() => setCurrentView('chat')}
            />
          ) : (
            <StudentSettings
              userId={persona}
              courseId={courseId}
              onClose={() => setCurrentView('chat')}
            />
          )}
        </div>

        {/* Canvas Drawer Footer */}
        <footer className="sidebar-footer">
          <p>Sonoran Desert Institute • 320px Canvas Drawer</p>
        </footer>
      </main>
    </div>
  );
};
