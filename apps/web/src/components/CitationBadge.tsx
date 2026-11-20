import React from 'react';
import { Citation } from '@virtual-ta/core';
import {
  AssignmentIcon,
  PageIcon,
  SyllabusIcon,
  AnnouncementIcon,
  ModuleIcon,
  LinkIcon,
} from './Icons.js';

interface CitationBadgeProps {
  citation: Citation;
}

export const CitationBadge: React.FC<CitationBadgeProps> = ({ citation }) => {
  const getIcon = (type: Citation['type']) => {
    switch (type) {
      case 'assignment':
        return <AssignmentIcon size={13} />;
      case 'page':
        return <PageIcon size={13} />;
      case 'syllabus':
        return <SyllabusIcon size={13} />;
      case 'announcement':
        return <AnnouncementIcon size={13} />;
      case 'module':
        return <ModuleIcon size={13} />;
      default:
        return <LinkIcon size={13} />;
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
