import React, { useState } from 'react';
import { LockIcon, ShieldCheckIcon, LightbulbIcon } from './Icons.js';

interface StudentSettingsProps {
  userId: string;
  personaId?: string;
  courseId: string;
  authToken?: string | null;
  onClose: () => void;
  onDataCleared?: () => void;
}

export const StudentSettings: React.FC<StudentSettingsProps> = ({
  userId,
  personaId,
  courseId,
  authToken,
  onClose,
  onDataCleared,
}) => {
  const [clearing, setClearing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleClearData = async () => {
    setClearing(true);
    setFeedback(null);
    setError(null);
    const targetId = personaId || userId;
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(targetId)}/data?personaId=${encodeURIComponent(targetId)}`,
        {
          method: 'DELETE',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFeedback(data.message || 'All conversation data cleared successfully.');
      setConfirming(false);
      onDataCleared?.();
    } catch (err: unknown) {
      setError(`Failed to clear data: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="settings-view" role="region" aria-label="Student Account & Privacy Settings">
      <div className="settings-header">
        <button
          type="button"
          className="back-btn"
          onClick={onClose}
          aria-label="Back to Virtual TA Drawer"
        >
          ← Back to Drawer
        </button>
        <h2>Account & Privacy</h2>
        <span className="placement-badge">Canvas user_profile</span>
      </div>

      <div className="settings-body">
        <div className="privacy-card">
          <h3>Your Privacy at SDI</h3>
          <ul className="privacy-list">
            <li>
              <span className="bullet-icon" aria-hidden="true">
                <LockIcon size={18} />
              </span>
              <div>
                <strong>Private Conversations</strong>
                <p>Your Virtual TA chats are completely private and never visible to other students or instructors.</p>
              </div>
            </li>
            <li>
              <span className="bullet-icon" aria-hidden="true">
                <ShieldCheckIcon size={18} />
              </span>
              <div>
                <strong>FERPA & Data Protection</strong>
                <p>Only synthetic course test data and sandbox content are used. No personal records are stored.</p>
              </div>
            </li>
            <li>
              <span className="bullet-icon" aria-hidden="true">
                <LightbulbIcon size={18} />
              </span>
              <div>
                <strong>Socratic Guidance</strong>
                <p>The Virtual TA asks questions and provides step-by-step hints to help you master concepts.</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="danger-zone-card">
          <h3>Conversation Data</h3>
          <p className="danger-description">
            You can delete your active conversations and stored chat history at any time (critique §3.1, §3.7).
          </p>

          {!confirming ? (
            <button
              type="button"
              className="danger-btn"
              onClick={() => setConfirming(true)}
              aria-label="Request data deletion"
            >
              Clear My Conversation Data
            </button>
          ) : (
            <div className="confirm-box" role="alertdialog" aria-labelledby="confirm-heading">
              <p id="confirm-heading"><strong>Are you sure?</strong></p>
              <p>This will erase your chat history in course <code>{courseId}</code>.</p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="danger-btn"
                  onClick={handleClearData}
                  disabled={clearing}
                >
                  {clearing ? 'Clearing...' : 'Yes, Delete My Data'}
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setConfirming(false)}
                  disabled={clearing}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {feedback && (
            <div className="feedback-alert success" role="alert">
              <span aria-hidden="true">✓ </span>
              <span>{feedback}</span>
            </div>
          )}

          {error && (
            <div className="feedback-alert error" role="alert">
              <span aria-hidden="true">⚠ </span>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
