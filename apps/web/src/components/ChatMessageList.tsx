import React from 'react';
import { Citation } from '@virtual-ta/core';
import { CitationBadge } from './CitationBadge.js';
import { ToolStatusPill } from './ToolStatusPill.js';
import { renderMarkdownWithMath } from '../markdown/render.js';
import {
  AcademicCapIcon,
  BookOpenIcon,
  PhoneIcon,
  ChatBubbleIcon,
  GlobeIcon,
  ShieldAlertIcon,
  AlertTriangleIcon,
} from './Icons.js';

export interface CrisisResourceInfo {
  hotlineName: string;
  phone: string;
  sms?: string;
  url: string;
  message?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  toolsUsed: string[];
  isCrisis?: boolean;
  crisis?: CrisisResourceInfo;
  createdAt: Date;
}

export interface ActiveToolStatus {
  toolName: string;
  status: 'calling' | 'executing' | 'complete' | 'error';
  message?: string;
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStudent: boolean;
  isStreaming: boolean;
  currentPageTitle: string;
  suggestions: string[];
  activeTool: ActiveToolStatus | null;
  error: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onSelectSuggestion: (prompt: string) => void;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  isStudent,
  isStreaming,
  currentPageTitle,
  suggestions,
  activeTool,
  error,
  messagesEndRef,
  onSelectSuggestion,
}) => {
  return (
    <div className="messages-container" tabIndex={0} aria-label="Chat messages history">
      {messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">
            {isStudent ? <AcademicCapIcon size={44} /> : <BookOpenIcon size={44} />}
          </div>
          <h3 className="empty-title">
            {isStudent ? 'SDI Student Virtual TA' : 'SDI Instructor Virtual TA'}
          </h3>
          <p className="empty-desc">
            {isStudent
              ? 'Ask questions about assignments, due dates, or course concepts. I guide Socratically to help you master the material.'
              : 'Directly look up course assignments, submission summaries, or draft announcements and lesson content.'}
          </p>
          <div className="page-context-pill">
            <span className="context-label">Simulated Canvas Page:</span>
            <span className="context-value">{currentPageTitle}</span>
          </div>

          <div className="starter-prompts">
            <span className="starter-heading">Suggested questions:</span>
            <div className="prompt-chips">
              {suggestions.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="prompt-chip"
                  onClick={() => onSelectSuggestion(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        messages.map((msg) => (
          <div key={msg.id} className={`message-bubble ${msg.role}`}>
            <div className="message-header">
              <span className="message-sender">
                {msg.role === 'user' ? (isStudent ? 'Alex (Student)' : 'Staff') : 'SDI Virtual TA'}
              </span>
              <span className="message-time">
                {msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div
              className="message-content"
              dangerouslySetInnerHTML={{
                __html:
                  msg.content.trim().length > 0
                    ? renderMarkdownWithMath(msg.content)
                    : isStreaming && msg.role === 'assistant'
                      ? '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>'
                      : '',
              }}
            />

            {msg.citations && msg.citations.length > 0 && (
              <div className="citations-list" aria-label="Canvas citations">
                <span className="citations-heading">Citations:</span>
                <div className="citations-badges">
                  {msg.citations.map((cite, i) => (
                    <CitationBadge key={i} citation={cite} />
                  ))}
                </div>
              </div>
            )}

            {msg.role === 'assistant' && (msg.isCrisis || Boolean(msg.crisis)) && (
              <div className="crisis-action-card" role="alert" aria-label="Emergency Crisis Support">
                <div className="crisis-card-header">
                  <ShieldAlertIcon size={18} className="crisis-icon" />
                  <strong>Immediate Confidential Support (24/7)</strong>
                </div>
                <div className="crisis-card-actions">
                  <a href={`tel:${msg.crisis?.phone || '988'}`} className="crisis-btn crisis-btn-call">
                    <PhoneIcon size={14} className="crisis-btn-icon" />
                    <span>Call {msg.crisis?.phone || '988'}</span>
                  </a>
                  {(msg.crisis?.sms ?? '988') && (
                    <a
                      href={`sms:${msg.crisis?.sms || '988'}`}
                      className="crisis-btn crisis-btn-sms"
                    >
                      <ChatBubbleIcon size={14} className="crisis-btn-icon" />
                      <span>Text {msg.crisis?.sms || '988'}</span>
                    </a>
                  )}
                  <a
                    href={msg.crisis?.url || 'https://988lifeline.org'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="crisis-btn crisis-btn-chat"
                  >
                    <GlobeIcon size={14} className="crisis-btn-icon" />
                    <span>{msg.crisis?.hotlineName || '988 Online Chat'}</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      {activeTool && (
        <ToolStatusPill
          toolName={activeTool.toolName}
          status={activeTool.status}
          message={activeTool.message}
        />
      )}

      {error && (
        <div className="feedback-alert error" role="alert">
          <AlertTriangleIcon size={16} className="feedback-icon" />
          <span>{error}</span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};
