import { useEffect, useState } from 'react';

interface HealthStatus {
  status: string;
  college: string;
  env: string;
  timestamp: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persona, setPersona] = useState<string>('demo_student');

  useEffect(() => {
    fetch('/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: HealthStatus) => setHealth(data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="demo-viewport">
      <div className="canvas-frame">
        <header className="sdi-header">
          <div className="sdi-brand">
            <span className="sdi-logo-square"></span>
            <h1>SDI AI Tutor</h1>
          </div>
          <span className="sdi-pill">{persona === 'demo_student' ? 'Student' : 'Instructor'}</span>
        </header>

        <div className="sidebar-content">
          <div className="persona-selector">
            <label htmlFor="persona-select">Persona:</label>
            <select
              id="persona-select"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            >
              <option value="demo_student">Demo Student (Alex)</option>
              <option value="demo_instructor">Demo Instructor (Prof. Martinez)</option>
            </select>
          </div>

          <div className="health-card">
            <h3>API Connection</h3>
            {health ? (
              <div className="status-badge connected">
                <span className="indicator"></span>
                <span>Connected ({health.status.toUpperCase()})</span>
              </div>
            ) : error ? (
              <div className="status-badge error">
                <span className="indicator"></span>
                <span>Error: {error}</span>
              </div>
            ) : (
              <div className="status-badge loading">
                <span className="indicator"></span>
                <span>Connecting to API...</span>
              </div>
            )}
            {health && (
              <div className="meta">
                <p>College: <strong>{health.college.toUpperCase()}</strong></p>
                <p>Environment: <strong>{health.env}</strong></p>
              </div>
            )}
          </div>

          <div className="welcome-box">
            <p className="welcome-text">
              {persona === 'demo_student'
                ? 'Welcome! Ask any questions about assignments, due dates, or course concepts.'
                : 'Welcome, Instructor. Look up submission stats or draft announcements.'}
            </p>
          </div>
        </div>

        <footer className="sidebar-footer">
          <p>SDI • 320px Canvas Sidebar Drawer</p>
        </footer>
      </div>
    </div>
  );
}
