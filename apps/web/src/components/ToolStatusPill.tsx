import React from 'react';

interface ToolStatusPillProps {
  toolName: string;
  status: 'calling' | 'executing' | 'complete' | 'error';
  message?: string;
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_student_grades: 'Checking gradebook',
  get_upcoming_assignments: 'Checking upcoming assignments',
  get_assignment_details: 'Fetching assignment details',
  get_syllabus: 'Consulting course syllabus',
  get_announcements: 'Checking course announcements',
  get_course_modules: 'Scanning course modules',
  get_course_page: 'Reading course page',
  calculate: 'Computing math with calculator',
  date_math: 'Calculating course deadline dates',
  get_assignments_without_due_dates: 'Scanning assignments without due dates',
  get_submission_summaries: 'Reviewing student submission stats',
  get_gradebook_summary: 'Generating gradebook distribution',
};

export const ToolStatusPill: React.FC<ToolStatusPillProps> = ({
  toolName,
  status,
  message,
}) => {
  const readableName = TOOL_DISPLAY_NAMES[toolName] || toolName.replace(/_/g, ' ');

  const getStatusText = () => {
    switch (status) {
      case 'calling':
        return `Calling: ${readableName}...`;
      case 'executing':
        return `Running: ${readableName}...`;
      case 'complete':
        return `Checked: ${readableName}`;
      case 'error':
        return `Error during: ${readableName}`;
    }
  };

  return (
    <div
      className={`tool-status-pill tool-status-${status}`}
      role="status"
      aria-live="polite"
    >
      <span className="tool-indicator-icon" aria-hidden="true">
        {status === 'complete' ? (
          '✓'
        ) : status === 'error' ? (
          '⚠'
        ) : (
          <span className="spinner-icon"></span>
        )}
      </span>
      <span className="tool-status-text">{message || getStatusText()}</span>
    </div>
  );
};
