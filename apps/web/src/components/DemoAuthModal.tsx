import React, { useState } from 'react';

interface DemoAuthModalProps {
  onSuccess: (token: string) => void;
}

export const DemoAuthModal: React.FC<DemoAuthModalProps> = ({ onSuccess }) => {
  const [credential, setCredential] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = credential.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    // Check if input looks like an email or password
    const isEmail = trimmed.includes('@');
    const payload = isEmail ? { email: trimmed } : { password: trimmed };

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Invalid passcode or email address.');
      }

      const data = await res.json();
      if (data.token) {
        onSuccess(data.token);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="auth-card">
        <div className="auth-header">
          <span className="sdi-logo-square" aria-hidden="true"></span>
          <h2 id="auth-title">SDI AI Tutor Demo Access</h2>
        </div>

        <p id="auth-desc" className="auth-description">
          This demo is connected to Canvas LMS test data. Sign-in is required to access the tutor environment (critique §4.3).
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="auth-credential" className="auth-label">
            Demo Passcode or Invited Email:
          </label>
          <input
            id="auth-credential"
            type="text"
            className="auth-input"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            placeholder="Enter passcode or email..."
            autoFocus
            required
            disabled={loading}
          />

          {error && (
            <div className="feedback-alert error" role="alert">
              <span aria-hidden="true">⚠ </span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading || !credential.trim()}>
            {loading ? 'Authenticating...' : 'Sign In to Demo'}
          </button>
        </form>

        <p className="auth-footer-note">
          Invited email access via Cloudflare Access is supported automatically.
        </p>
      </div>
    </div>
  );
};
