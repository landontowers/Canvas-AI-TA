import React from 'react';
import { Citation } from '@ai-tutor/core';

interface CitationBadgeProps {
  citation: Citation;
}

export const CitationBadge: React.FC<CitationBadgeProps> = ({ citation }) => {
  const getIcon = (type: Citation['type']) => {
    switch (type) {
      case 'assignment':
        return '📝';
      case 'page':
        return '📄';
      case 'syllabus':
        return '📋';
      case 'announcement':
        return '📢';
      case 'module':
        return '📦';
      default:
        return '🔗';
    }
  };

  const getLabel = (type: Citation['type']) => {
    switch (type) {
      case 'assignment':
        return 'Assignment';
      case 'page':
        return 'Page';
      case 'syllabus':
        return 'Syllabus';
      case 'announcement':
        return 'Announcement';
      case 'module':
        return 'Module';
      default:
        return 'Reference';
    }
  };

  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      className="citation-badge"
      aria-label={`${getLabel(citation.type)} citation: ${citation.title}`}
      title={`${getLabel(citation.type)}: ${citation.title}`}
    >
      <span className="citation-icon" aria-hidden="true">
        {getIcon(citation.type)}
      </span>
      <span className="citation-title">{citation.title}</span>
    </a>
  );
};
