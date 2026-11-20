import React, { useEffect, useState } from 'react';

interface InstructorSettingsProps {
  courseId: string;
  personaId: string;
  authToken?: string | null;
  onClose: () => void;
}

export const InstructorSettings: React.FC<InstructorSettingsProps> = ({
  courseId,
  personaId,
  authToken,
  onClose,
}) => {
  const [setting, setSetting] = useState<'full' | 'logistics_only'>('full');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/courses/${courseId}/settings`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { setting: 'full' | 'logistics_only' }) => {
        if (!cancelled) {
          setSetting(data.setting);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`Failed to load settings: ${err.message}`);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, authToken]);

  const handleSave = async (newSetting: 'full' | 'logistics_only') => {
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ setting: newSetting, personaId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setSetting(updated.setting);
      setFeedback(`Course setting updated to ${updated.setting === 'full' ? 'Full Socratic Guidance' : 'Logistics Only'}.`);
    } catch (err: unknown) {
      setError(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-view" role="region" aria-label="Course Settings">
      <div className="settings-header">
        <button
          type="button"
          className="back-btn"
          onClick={onClose}
          aria-label="Back to Virtual TA Drawer"
        >
          ← Back to Drawer
        </button>
        <h2>Course Settings (Staff)</h2>
        <span className="placement-badge">Canvas course_navigation</span>
      </div>

      <div className="settings-body">
        <div className="course-meta">
          <p className="course-id">Course: <strong>FTT 101: Firearms Industry Fundamentals</strong></p>
          <p className="staff-role">
            Active Staff: <strong>{personaId === 'demo_instructor' ? 'Prof. Elena Martinez (Instructor)' : 'Jordan Lee (Teaching Assistant)'}</strong>
          </p>
        </div>

        {loading ? (
          <div className="settings-loading" role="status">
            <span>Loading course settings...</span>
          </div>
        ) : (
          <fieldset className="settings-fieldset" disabled={saving}>
            <legend className="settings-legend">Virtual TA Pedagogy Mode</legend>
            <p className="settings-description">
              Controls how the student Virtual TA interacts with enrolled students in this course (critique §3.4).
            </p>

            <div className={`setting-option ${setting === 'full' ? 'selected' : ''}`}>
              <label htmlFor="setting-full" className="option-label">
                <input
                  type="radio"
                  id="setting-full"
                  name="course-virtual-ta-mode"
                  value="full"
                  checked={setting === 'full'}
                  onChange={() => handleSave('full')}
                />
                <div className="option-content">
                  <span className="option-title">Full Virtual TA (Default)</span>
                  <p className="option-detail">
                    Socratic guidance for course material and assignments; direct answers for course logistics (schedules, policies, announcements).
                  </p>
                </div>
              </label>
            </div>

            <div className={`setting-option ${setting === 'logistics_only' ? 'selected' : ''}`}>
              <label htmlFor="setting-logistics" className="option-label">
                <input
                  type="radio"
                  id="setting-logistics"
                  name="course-virtual-ta-mode"
                  value="logistics_only"
                  checked={setting === 'logistics_only'}
                  onChange={() => handleSave('logistics_only')}
                />
                <div className="option-content">
                  <span className="option-title">Logistics Only</span>
                  <p className="option-detail">
                    Direct answers for logistics only. The Virtual TA politely declines course-material questions and fetches zero course content.
                  </p>
                </div>
              </label>
            </div>
          </fieldset>
        )}

        {saving && (
          <div className="saving-indicator" role="status">
            <span>Saving changes to Canvas course...</span>
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
  );
};
