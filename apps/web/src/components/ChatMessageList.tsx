import React, { useState } from 'react';
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
  CloseIcon,
  PageIcon,
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
  rating?: 'up' | 'down';
  createdAt: Date;
}

export interface ActiveToolStatus {
  toolName: string;
  status: 'calling' | 'executing' | 'complete' | 'error';
  message?: string;
}

export interface PracticeCardItem {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

function formatHumanError(raw: string): string {
  let msg = raw;
  for (let i = 0; i < 4; i++) {
    const trimmed = msg.trim();
    if (!trimmed.startsWith('{')) break;
    try {
      const parsed = JSON.parse(trimmed) as {
        message?: unknown;
        error?: { message?: unknown } | string;
      };
      if (typeof parsed.error === 'object' && parsed.error !== null && typeof parsed.error.message === 'string') {
        msg = parsed.error.message;
        continue;
      }
      if (typeof parsed.message === 'string') {
        msg = parsed.message;
        continue;
      }
    } catch {
      break;
    }
    break;
  }
  return msg.trim() || 'An unexpected error occurred. Please try again.';
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
  practiceCards?: PracticeCardItem[] | null;
  practiceTopic?: string;
  isLoadingPractice?: boolean;
  onClosePractice?: () => void;
  onSelectSuggestion: (prompt: string) => void;
  onRateMessage?: (messageId: string, rating: 'up' | 'down') => void;
}

function parseMessageAttachments(content: string): {
  displayContent: string;
  attachedDrafts: string[];
} {
  const attachedDrafts: string[] = [];
  const displayContent = content
    .replace(
      /<attached_draft\s+filename="([^"]+)"\s*>[\s\S]*?<\/attached_draft>/gi,
      (_match, filename: string) => {
        const trimmed = filename.trim();
        if (trimmed) attachedDrafts.push(trimmed);
        return '';
      },
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { displayContent, attachedDrafts };
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
  practiceCards,
  practiceTopic,
  isLoadingPractice,
  onClosePractice,
  onSelectSuggestion,
  onRateMessage,
}) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId((prev) => (prev === msgId ? null : prev)), 2000);
    } catch {
      // Clipboard API unavailable in headless tests
    }
  };

  return (
    <div className="messages-container" tabIndex={0} aria-label="Chat messages history">
      {(isLoadingPractice || (practiceCards && practiceCards.length > 0)) && (
        <section className="practice-panel" aria-label="Interactive Self-Check Practice">
          <div className="practice-header">
            <strong>Self-Check: {practiceTopic || 'Course Review'}</strong>
            {onClosePractice && (
              <button
                type="button"
                className="history-icon-btn"
                onClick={onClosePractice}
                aria-label="Close practice cards"
              >
                <CloseIcon size={12} />
              </button>
            )}
          </div>
          {isLoadingPractice ? (
            <p className="practice-loading">Generating practice check...</p>
          ) : (
            practiceCards?.map((card, idx) => {
              const chosen = selectedAnswers[idx];
              const answered = chosen !== undefined;
              return (
                <div key={idx} className="practice-card">
                  <p className="practice-question">
                    {idx + 1}. {card.question}
                  </p>
                  <div className="practice-options">
                    {card.options.map((opt, optIdx) => {
                      const isChosen = chosen === optIdx;
                      const isCorrect = optIdx === card.correctIndex;
                      const statusClass = answered
                        ? isCorrect
                          ? 'correct'
                          : isChosen
                            ? 'incorrect'
                            : ''
                        : '';
                      return (
                        <button
                          key={optIdx}
                          type="button"
                          className={`practice-option-btn ${statusClass}`}
                          onClick={() =>
                            setSelectedAnswers((prev) => ({ ...prev, [idx]: optIdx }))
                          }
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {answered && (
                    <p className="practice-explanation" role="status">
                      {chosen === card.correctIndex ? '✓ ' : '✗ '}
                      {card.explanation}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </section>
      )}

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
        messages.map((msg) => {
          const { displayContent, attachedDrafts } = parseMessageAttachments(msg.content);
          return (
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
                  displayContent.length > 0
                    ? renderMarkdownWithMath(displayContent)
                    : isStreaming && msg.role === 'assistant'
                      ? '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>'
                      : '',
              }}
            />

            {attachedDrafts.length > 0 && (
              <div className="citations-list attached-drafts-list" aria-label="Attached documents">
                <span className="citations-heading">Attached:</span>
                <div className="citations-badges">
                  {attachedDrafts.map((filename, i) => (
                    <span key={i} className="citation-badge attached-draft-badge">
                      <span className="citation-icon" aria-hidden="true">
                        <PageIcon size={12} />
                      </span>
                      <span>{filename}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {msg.role === 'assistant' && msg.content.trim().length > 0 && !isStreaming && (
              <div className="message-actions-row">
                {onRateMessage && (
                  <div className="feedback-btns" role="group" aria-label="Response feedback">
                    <button
                      type="button"
                      className={`msg-action-btn ${msg.rating === 'up' ? 'active' : ''}`}
                      onClick={() => onRateMessage(msg.id, 'up')}
                      aria-label="Helpful response"
                      aria-pressed={msg.rating === 'up'}
                      title="Helpful"
                    >
                      Helpful
                    </button>
                    <button
                      type="button"
                      className={`msg-action-btn ${msg.rating === 'down' ? 'active' : ''}`}
                      onClick={() => onRateMessage(msg.id, 'down')}
                      aria-label="Needs improvement"
                      aria-pressed={msg.rating === 'down'}
                      title="Needs improvement"
                    >
                      Not helpful
                    </button>
                  </div>
                )}

                {!isStudent && (
                  <div className="copy-btns" role="group" aria-label="Export draft">
                    <button
                      type="button"
                      className="msg-action-btn"
                      onClick={() => void handleCopy(`${msg.id}-md`, msg.content)}
                      aria-label="Copy as Markdown"
                    >
                      {copiedId === `${msg.id}-md` ? 'Copied MD' : 'Copy MD'}
                    </button>
                    <button
                      type="button"
                      className="msg-action-btn"
                      onClick={() =>
                        void handleCopy(`${msg.id}-html`, renderMarkdownWithMath(msg.content))
                      }
                      aria-label="Copy as Canvas HTML"
                    >
                      {copiedId === `${msg.id}-html` ? 'Copied HTML' : 'Copy Canvas HTML'}
                    </button>
                  </div>
                )}
              </div>
            )}

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
          );
        })
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
          <span>
            <strong>Error:</strong> {formatHumanError(error)}
          </span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};
