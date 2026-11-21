import React, { useEffect, useState } from 'react';

interface InstructorSettingsProps {
  courseId: string;
  personaId: string;
  authToken?: string | null;
  onClose: () => void;
  onDraftPulseAnnouncement?: (topics: string[]) => void;
}

interface ConfusionPulseState {
  thresholdMet: boolean;
  distinctStudents: number;
  minThreshold: number;
  topics: Array<{ topic: string; count: number }>;
}

interface CrisisIncidentItem {
  id: string;
  courseId: string;
  category: string;
  triggerSnippet: string;
  status?: 'new' | 'acknowledged' | 'resolved';
  timestamp: string;
}

export const InstructorSettings: React.FC<InstructorSettingsProps> = ({
  courseId,
  personaId,
  authToken,
  onClose,
  onDraftPulseAnnouncement,
}) => {
  const [setting, setSetting] = useState<'full' | 'logistics_only' | 'off'>('full');
  const [blackoutStart, setBlackoutStart] = useState('');
  const [blackoutEnd, setBlackoutEnd] = useState('');
  const [confusionPulse, setConfusionPulse] = useState<ConfusionPulseState | null>(null);
  const [crisisIncidents, setCrisisIncidents] = useState<CrisisIncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const headers: Record<string, string> = authToken
      ? { Authorization: `Bearer ${authToken}` }
      : {};

    Promise.all([
      fetch(`/api/courses/${courseId}/settings`, { headers }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`/api/courses/${courseId}/confusion-pulse?personaId=${encodeURIComponent(personaId)}`, {
        headers,
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/admin/crisis-incidents?personaId=${encodeURIComponent(personaId)}`, {
        headers,
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(
        ([settingsData, pulseData, incidentsData]: [
          { setting: 'full' | 'logistics_only' | 'off'; blackoutStart?: string; blackoutEnd?: string },
          ConfusionPulseState | null,
          { incidents?: CrisisIncidentItem[] } | null,
        ]) => {
          if (cancelled) return;
          setSetting(settingsData.setting);
          setBlackoutStart(
            settingsData.blackoutStart ? settingsData.blackoutStart.slice(0, 16) : '',
          );
          setBlackoutEnd(settingsData.blackoutEnd ? settingsData.blackoutEnd.slice(0, 16) : '');
          if (pulseData) setConfusionPulse(pulseData);
          if (incidentsData?.incidents) setCrisisIncidents(incidentsData.incidents);
          setLoading(false);
        },
      )
      .catch((err) => {
        if (!cancelled) {
          setError(`Failed to load settings: ${err.message}`);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, personaId, authToken]);

  const handleSave = async (
    newSetting: 'full' | 'logistics_only' | 'off',
    blackoutOverride?: { start: string | null; end: string | null },
  ) => {
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const bStart =
        blackoutOverride !== undefined
          ? blackoutOverride.start
          : blackoutStart
            ? new Date(blackoutStart).toISOString()
            : undefined;
      const bEnd =
        blackoutOverride !== undefined
          ? blackoutOverride.end
          : blackoutEnd
            ? new Date(blackoutEnd).toISOString()
            : undefined;

      const res = await fetch(`/api/courses/${courseId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          setting: newSetting,
          blackoutStart: bStart,
          blackoutEnd: bEnd,
          personaId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setSetting(updated.setting);
      const label =
        updated.setting === 'full'
          ? 'Full Socratic Guidance'
          : updated.setting === 'logistics_only'
            ? 'Logistics Only'
            : 'Off (Disabled)';
      setFeedback(`Course setting updated to ${label}.`);
    } catch (err: unknown) {
      setError(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateIncident = async (
    incidentId: string,
    status: 'acknowledged' | 'resolved',
  ) => {
    try {
      const res = await fetch(`/api/admin/crisis-incidents/${encodeURIComponent(incidentId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ status, personaId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { incident?: CrisisIncidentItem };
        if (data.incident) {
          setCrisisIncidents((prev) =>
            prev.map((i) => (i.id === incidentId ? data.incident! : i)),
          );
        }
      }
    } catch {
      // ignore triage update failure
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
          <p className="course-id">
            Course: <strong>FTT 101: Firearms Industry Fundamentals</strong>
          </p>
          <p className="staff-role">
            Active Staff:{' '}
            <strong>
              {personaId === 'demo_instructor'
                ? 'Prof. Elena Martinez (Instructor)'
                : 'Jordan Lee (Teaching Assistant)'}
            </strong>
          </p>
        </div>

        {loading ? (
          <div className="settings-loading" role="status">
            <span>Loading course settings...</span>
          </div>
        ) : (
          <>
            <fieldset className="settings-fieldset" disabled={saving}>
              <legend className="settings-legend">Virtual TA Pedagogy Mode</legend>
              <p className="settings-description">
                Controls how the student Virtual TA interacts with enrolled students in this course
                (critique §3.4).
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
                      Socratic guidance for course material and assignments; direct answers for
                      course logistics.
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
                      Direct answers for logistics only. The Virtual TA politely declines
                      course-material questions.
                    </p>
                  </div>
                </label>
              </div>

              <div className={`setting-option ${setting === 'off' ? 'selected' : ''}`}>
                <label htmlFor="setting-off" className="option-label">
                  <input
                    type="radio"
                    id="setting-off"
                    name="course-virtual-ta-mode"
                    value="off"
                    checked={setting === 'off'}
                    onChange={() => handleSave('off')}
                  />
                  <div className="option-content">
                    <span className="option-title">Off (Disabled)</span>
                    <p className="option-detail">
                      Pauses Student Virtual TA assistance entirely for this course.
                    </p>
                  </div>
                </label>
              </div>
            </fieldset>

            <section className="settings-subsection" aria-label="Exam Blackout Window">
              <h3>Exam / Quiz Blackout Window</h3>
              <div className="blackout-grid">
                <label htmlFor="blackout-start">
                  Start
                  <input
                    id="blackout-start"
                    type="datetime-local"
                    value={blackoutStart}
                    onChange={(e) => setBlackoutStart(e.target.value)}
                  />
                </label>
                <label htmlFor="blackout-end">
                  End
                  <input
                    id="blackout-end"
                    type="datetime-local"
                    value={blackoutEnd}
                    onChange={(e) => setBlackoutEnd(e.target.value)}
                  />
                </label>
              </div>
              <div className="blackout-actions">
                <button
                  type="button"
                  className="msg-action-btn"
                  disabled={!blackoutStart || !blackoutEnd || saving}
                  onClick={() =>
                    void handleSave(setting, {
                      start: new Date(blackoutStart).toISOString(),
                      end: new Date(blackoutEnd).toISOString(),
                    })
                  }
                >
                  Save Blackout
                </button>
                <button
                  type="button"
                  className="msg-action-btn"
                  disabled={saving}
                  onClick={() => {
                    setBlackoutStart('');
                    setBlackoutEnd('');
                    void handleSave(setting, { start: null, end: null });
                  }}
                >
                  Clear Blackout
                </button>
              </div>
            </section>

            {confusionPulse && (
              <section className="settings-subsection" aria-label="Class Confusion Pulse">
                <h3>Class Confusion Pulse</h3>
                {!confusionPulse.thresholdMet ? (
                  <p className="pulse-privacy-note">
                    Waiting for k-anonymity minimum ({confusionPulse.distinctStudents}/
                    {confusionPulse.minThreshold} distinct students) before displaying topic
                    trends.
                  </p>
                ) : (
                  <>
                    <ul className="pulse-list">
                      {confusionPulse.topics.map((t) => (
                        <li key={t.topic}>
                          <span>{t.topic}</span>
                          <strong>{t.count} threads</strong>
                        </li>
                      ))}
                    </ul>
                    {onDraftPulseAnnouncement && confusionPulse.topics.length > 0 && (
                      <button
                        type="button"
                        className="msg-action-btn"
                        onClick={() =>
                          onDraftPulseAnnouncement(confusionPulse.topics.map((t) => t.topic))
                        }
                      >
                        Draft Review Announcement
                      </button>
                    )}
                  </>
                )}
              </section>
            )}

            {crisisIncidents.length > 0 && (
              <section className="settings-subsection" aria-label="Crisis Incident Queue">
                <h3>Crisis Incident Queue (FERPA § 99.36)</h3>
                <ul className="crisis-queue-list">
                  {crisisIncidents.slice(0, 5).map((inc) => (
                    <li key={inc.id} className="crisis-queue-item">
                      <div>
                        <strong>{inc.category}</strong> •{' '}
                        <span className="incident-status">{inc.status || 'new'}</span>
                      </div>
                      <div className="incident-actions">
                        {inc.status !== 'acknowledged' && inc.status !== 'resolved' && (
                          <button
                            type="button"
                            className="msg-action-btn"
                            onClick={() => void handleUpdateIncident(inc.id, 'acknowledged')}
                          >
                            Acknowledge
                          </button>
                        )}
                        {inc.status !== 'resolved' && (
                          <button
                            type="button"
                            className="msg-action-btn"
                            onClick={() => void handleUpdateIncident(inc.id, 'resolved')}
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
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
