import React, { useEffect, useState } from 'react';
import { LockIcon, ShieldCheckIcon, LightbulbIcon } from './Icons.js';

interface StudentSettingsProps {
  userId: string;
  personaId?: string;
  courseId: string;
  authToken?: string | null;
  onClose: () => void;
  onDataCleared?: () => void;
}

interface LearningContextView {
  preferredStyle?: string | null;
  recurringTopics: string[];
  notes?: string | null;
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
  const [confirmScope, setConfirmScope] = useState<'chats' | 'context' | null>(null);
  const [learningContext, setLearningContext] = useState<LearningContextView | null>(null);
  const [styleInput, setStyleInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [savingContext, setSavingContext] = useState(false);

  const targetId = personaId || userId;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${encodeURIComponent(targetId)}/context?personaId=${encodeURIComponent(targetId)}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LearningContextView | null) => {
        if (!cancelled && data) {
          setLearningContext(data);
          setStyleInput(data.preferredStyle || '');
          setNotesInput(data.notes || '');
        }
      })
      .catch(() => {
        // Non-blocking in environments without context endpoint
      });
    return () => {
      cancelled = true;
    };
  }, [targetId, authToken]);

  const handleSaveContext = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingContext(true);
    setFeedback(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(targetId)}/context?personaId=${encodeURIComponent(targetId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            preferredStyle: styleInput.trim() || null,
            notes: notesInput.trim() || null,
          }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = (await res.json()) as LearningContextView;
      setLearningContext(updated);
      setFeedback('Learning preferences saved.');
    } catch (err: unknown) {
      setError(`Failed to save preferences: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingContext(false);
    }
  };

  const handleDelete = async (scope: 'chats' | 'context') => {
    setClearing(true);
    setFeedback(null);
    setError(null);
    try {
      const endpoint =
        scope === 'chats'
          ? `/api/users/${encodeURIComponent(targetId)}/data?personaId=${encodeURIComponent(targetId)}&scope=chats`
          : `/api/users/${encodeURIComponent(targetId)}/context?personaId=${encodeURIComponent(targetId)}`;

      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFeedback(
        data.message ||
          (scope === 'chats'
            ? 'Previous chats cleared successfully.'
            : 'Personal learning context cleared successfully.'),
      );
      setConfirmScope(null);
      if (scope === 'chats') {
        onDataCleared?.();
      } else {
        setLearningContext({ preferredStyle: null, recurringTopics: [], notes: null });
      }
    } catch (err: unknown) {
      setError(`Failed to clear data: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setClearing(false);
    }
  };

  const hasSavedContext = Boolean(
    learningContext &&
      (learningContext.preferredStyle ||
        (learningContext.recurringTopics?.length ?? 0) > 0 ||
        learningContext.notes),
  );

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

        <div className="privacy-card" aria-label="Personal Learning Context">
          <h3>Saved Learning Context</h3>
          {!hasSavedContext ? (
            <p className="danger-description">No personal learning context saved yet.</p>
          ) : (
            <ul className="privacy-list">
              {learningContext?.preferredStyle && (
                <li>
                  <div>
                    <strong>Preferred Style:</strong> {learningContext.preferredStyle}
                  </div>
                </li>
              )}
              {learningContext && (learningContext.recurringTopics?.length ?? 0) > 0 && (
                <li>
                  <div>
                    <strong>Recent Study Topics:</strong> {learningContext.recurringTopics.join(', ')}
                  </div>
                </li>
              )}
              {learningContext?.notes && (
                <li>
                  <div>
                    <strong>Notes:</strong> {learningContext.notes}
                  </div>
                </li>
              )}
            </ul>
          )}

          <form className="learning-context-form" onSubmit={(e) => void handleSaveContext(e)}>
            <label htmlFor="preferred-style-select">
              Preferred Explanation Style
              <select
                id="preferred-style-select"
                value={styleInput}
                onChange={(e) => setStyleInput(e.target.value)}
              >
                <option value="">Auto-detect from chat</option>
                <option value="step-by-step explanations">Step-by-step explanations</option>
                <option value="concise bulleted summaries">Concise bulleted summaries</option>
                <option value="brief, concise answers">Brief, concise answers</option>
                <option value="real-world analogies and examples">Real-world analogies &amp; examples</option>
                <option value="plain-language beginner explanations">Plain-language beginner explanations</option>
              </select>
            </label>
            <label htmlFor="learning-notes-input">
              Study Notes
              <textarea
                id="learning-notes-input"
                rows={2}
                maxLength={500}
                placeholder="e.g. Show unit conversions explicitly (grains, fps, inches)"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
              />
            </label>
            <button type="submit" className="msg-action-btn" disabled={savingContext}>
              {savingContext ? 'Saving...' : 'Save Preferences'}
            </button>
          </form>
        </div>

        <div className="danger-zone-card">
          <h3>Manage Your Data</h3>
          <p className="danger-description">
            Choose whether to delete only your previous chat threads or clear your saved personal learning context (critique §3.1, §3.7).
          </p>

          {!confirmScope ? (
            <div className="confirm-actions">
              <button
                type="button"
                className="danger-btn"
                onClick={() => setConfirmScope('chats')}
                aria-label="Delete only previous chats"
              >
                Delete Only Previous Chats
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => setConfirmScope('context')}
                aria-label="Delete personal context"
              >
                Delete Personal Context
              </button>
            </div>
          ) : (
            <div className="confirm-box" role="alertdialog" aria-labelledby="confirm-heading">
              <p id="confirm-heading"><strong>Are you sure?</strong></p>
              <p>
                {confirmScope === 'chats'
                  ? `This will erase your previous chat history in course ${courseId} while keeping your saved learning context.`
                  : 'This will erase your saved learning preferences and recurring topics while keeping your previous chats.'}
              </p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => void handleDelete(confirmScope)}
                  disabled={clearing}
                >
                  {clearing
                    ? 'Clearing...'
                    : confirmScope === 'chats'
                      ? 'Yes, Delete Previous Chats'
                      : 'Yes, Delete Personal Context'}
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setConfirmScope(null)}
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
