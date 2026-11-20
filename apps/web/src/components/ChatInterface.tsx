import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Citation, StreamEvent } from '@ai-tutor/core';
import { CitationBadge } from './CitationBadge.js';
import { ToolStatusPill } from './ToolStatusPill.js';
import { renderMarkdownWithMath } from '../markdown/render.js';
import {
  PlusIcon,
  HistoryIcon,
  RefreshIcon,
  CloseIcon,
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

export interface ConversationItem {
  id: string;
  collegeId: string;
  courseId: string;
  userId: string;
  role: string;
  title?: string;
  messageCount?: number;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageContextInfo {
  title?: string;
  url?: string;
  content?: string;
}

interface ChatInterfaceProps {
  personaId: string;
  courseId: string;
  currentPageTitle: string;
  pageContext?: PageContextInfo;
  highContrast: boolean;
  authToken?: string | null;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  personaId,
  courseId,
  currentPageTitle,
  pageContext,
  authToken,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<{
    toolName: string;
    status: 'calling' | 'executing' | 'complete' | 'error';
    message?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState('');

  // Conversation history & resume state
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [conversationList, setConversationList] = useState<ConversationItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isLoadingChat, setIsLoadingChat] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isStudent = personaId === 'demo_student';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTool, scrollToBottom]);

  const loadConversationList = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/conversations?personaId=${encodeURIComponent(personaId)}&courseId=${encodeURIComponent(courseId)}`,
        {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setConversationList(data);
        }
      }
    } catch {
      // ignore history load error
    } finally {
      setIsLoadingHistory(false);
    }
  }, [personaId, courseId, authToken]);

  // Reset conversation and reload history when switching persona or course
  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setActiveTool(null);
    setShowHistory(false);
    void loadConversationList();
  }, [personaId, courseId, loadConversationList]);

  const handleNewChat = () => {
    if (isStreaming) {
      handleStop();
    }
    setMessages([]);
    setConversationId(null);
    setError(null);
    setActiveTool(null);
    setShowHistory(false);
    setScreenReaderAnnouncement('Started a new conversation.');
    textareaRef.current?.focus();
  };

  const handleSelectConversation = async (selectedId: string) => {
    if (selectedId === conversationId && messages.length > 0) {
      setShowHistory(false);
      return;
    }

    if (isStreaming) {
      handleStop();
    }

    setIsLoadingChat(true);
    setError(null);
    setActiveTool(null);

    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(selectedId)}/messages?personaId=${encodeURIComponent(personaId)}`,
        {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        },
      );

      if (!res.ok) {
        throw new Error(`Failed to load chat history (HTTP ${res.status})`);
      }

      const rawMsgs = await res.json();
      const loadedMsgs: ChatMessage[] = rawMsgs.map((m: {
        id: string;
        role: string;
        content: string;
        citations?: Citation[];
        isCrisis?: boolean;
        createdAt: string | Date;
      }) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        citations: m.citations || [],
        toolsUsed: [],
        isCrisis: Boolean(m.isCrisis),
        createdAt: new Date(m.createdAt),
      }));

      setMessages(loadedMsgs);
      setConversationId(selectedId);
      setShowHistory(false);
      setScreenReaderAnnouncement(
        `Resumed conversation with ${loadedMsgs.length} messages. You can review earlier answers or continue asking questions.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setScreenReaderAnnouncement(`Error resuming conversation: ${msg}`);
    } finally {
      setIsLoadingChat(false);
      textareaRef.current?.focus();
    }
  };

  const formatTimeOrDate = (isoStr?: string) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setActiveTool(null);
    setScreenReaderAnnouncement('Response generation stopped by user.');
    textareaRef.current?.focus();
  };

  const sendMessage = async (textToSend?: string) => {
    const messageContent = (textToSend !== undefined ? textToSend : input).trim();
    if (!messageContent || isStreaming) return;

    setInput('');
    setError(null);

    const userMsgId = `msg_${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: messageContent,
      citations: [],
      toolsUsed: [],
      createdAt: new Date(),
    };

    const assistantMsgId = `msg_${Date.now() + 1}`;
    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      citations: [],
      toolsUsed: [],
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setIsStreaming(true);
    setScreenReaderAnnouncement(`Sending question: ${messageContent}`);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          personaId,
          message: messageContent,
          courseId,
          conversationId: conversationId ?? undefined,
          pageContext: pageContext || { title: currentPageTitle },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported by browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedAssistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const rawEvent of events) {
          const trimmed = rawEvent.trim();
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const event: StreamEvent = JSON.parse(trimmed.slice(6));

            switch (event.type) {
              case 'text-delta':
                accumulatedAssistantText += event.delta;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: accumulatedAssistantText }
                      : msg,
                  ),
                );
                break;

              case 'tool-status':
                setActiveTool({
                  toolName: event.toolName,
                  status: event.status,
                  message: event.message,
                });
                if (event.status === 'complete') {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? {
                            ...msg,
                            toolsUsed: Array.from(new Set([...msg.toolsUsed, event.toolName])),
                          }
                        : msg,
                    ),
                  );
                }
                break;

              case 'citation':
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          citations: [...msg.citations, event.citation],
                        }
                      : msg,
                  ),
                );
                break;

              case 'done':
                setConversationId(event.conversationId);
                setActiveTool(null);
                void loadConversationList();
                setScreenReaderAnnouncement(
                  accumulatedAssistantText
                    ? `AI Tutor finished responding: ${accumulatedAssistantText.slice(0, 150)}...`
                    : 'AI Tutor finished responding.',
                );
                break;

              case 'crisis':
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          isCrisis: true,
                          crisis: {
                            hotlineName: event.hotlineName,
                            phone: event.phone,
                            sms: event.sms,
                            url: event.url,
                            message: event.message,
                          },
                        }
                      : msg,
                  ),
                );
                break;

              case 'error':
                setError(event.error);
                break;
            }
          } catch {
            // ignore JSON parse errors in malformed lines
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        // user aborted, handled in handleStop
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        setScreenReaderAnnouncement(`Error during response: ${errorMsg}`);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      setActiveTool(null);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Quick suggestions based on persona & simulated Canvas page
  const getSuggestions = () => {
    if (isStudent) {
      return [
        'When is Safety Lab 1 due?',
        'What assignments do I have due across all my classes this week?',
        'I am stuck on firearm nomenclature and barrel twist.',
        'What does the syllabus say about late submissions?',
        'Calculate bullet energy for a 55gr bullet at 3100 fps',
      ];
    } else {
      return [
        'Which assignments are missing due dates?',
        'Summarize student submission stats for Safety Lab 1.',
        'Draft an announcement reminding students about firearm safety.',
        'Give me an overview of the gradebook distribution.',
      ];
    }
  };

  return (
    <div className="chat-interface" role="region" aria-label="Tutor Chat">
      {/* Screen Reader Live Region (Accessible live updates per modern-web-guidance) */}
      <div aria-live="polite" aria-atomic="false" className="visually-hidden">
        {screenReaderAnnouncement}
      </div>

      {/* Top Controls Toolbar: New Chat & History */}
      <div className="chat-toolbar" role="toolbar" aria-label="Conversation tools">
        <button
          type="button"
          className="toolbar-btn new-chat-btn"
          onClick={handleNewChat}
          aria-label="Start a new chat"
          title="Start a new chat"
        >
          <PlusIcon size={14} className="btn-icon" />
          <span>New Chat</span>
        </button>

        <button
          type="button"
          className={`toolbar-btn history-toggle-btn ${showHistory ? 'active' : ''}`}
          onClick={() => {
            setShowHistory((prev) => !prev);
            if (!showHistory) {
              void loadConversationList();
            }
          }}
          aria-expanded={showHistory}
          aria-label={showHistory ? 'Close previous chats' : 'View previous chats'}
          title="Previous chats"
        >
          <HistoryIcon size={14} className="btn-icon" />
          <span>Previous Chats</span>
          {conversationList.length > 0 && (
            <span className="history-badge" aria-label={`${conversationList.length} previous chats`}>
              {conversationList.length}
            </span>
          )}
        </button>
      </div>

      {/* Previous Chats Drawer / Slide-over Panel */}
      {showHistory && (
        <div className="history-panel" role="region" aria-label="Previous chats list">
          <div className="history-header">
            <div className="history-title-wrap">
              <HistoryIcon size={15} className="history-header-icon" />
              <h4>Previous Chats ({conversationList.length})</h4>
            </div>
            <div className="history-header-actions">
              <button
                type="button"
                className="history-icon-btn"
                onClick={() => void loadConversationList()}
                disabled={isLoadingHistory}
                aria-label="Refresh previous chats"
                title="Refresh list"
              >
                <RefreshIcon size={14} />
              </button>
              <button
                type="button"
                className="history-icon-btn"
                onClick={() => setShowHistory(false)}
                aria-label="Close previous chats panel"
                title="Close"
              >
                <CloseIcon size={14} />
              </button>
            </div>
          </div>

          <div className="history-list" tabIndex={0} aria-label="List of previous chats">
            {isLoadingHistory ? (
              <div className="history-loading">
                <span className="history-spinner" aria-hidden="true"></span>
                <span>Loading your chats...</span>
              </div>
            ) : conversationList.length === 0 ? (
              <div className="history-empty">
                <p>No previous chats for this course.</p>
                <span>Ask a question to start your first chat!</span>
              </div>
            ) : (
              conversationList.map((conv) => {
                const isActive = conv.id === conversationId;
                return (
                  <div
                    key={conv.id}
                    className={`history-card ${isActive ? 'active-chat' : ''}`}
                    onClick={() => void handleSelectConversation(conv.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void handleSelectConversation(conv.id);
                      }
                    }}
                    aria-label={`Resume chat: ${conv.title || 'Chat'}, ${conv.messageCount ?? 0} messages, ${formatTimeOrDate(conv.lastMessageAt || conv.updatedAt)}`}
                  >
                    <div className="history-card-main">
                      <span className="history-card-title">{conv.title || 'Conversation'}</span>
                      <span className="history-card-date">
                        {formatTimeOrDate(conv.lastMessageAt || conv.updatedAt)}
                      </span>
                    </div>
                    <div className="history-card-meta">
                      {isActive ? (
                        <span className="current-chat-pill">Active</span>
                      ) : (
                        <span className="msg-count-pill">{conv.messageCount ?? 0} msgs</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Loading overlay when switching/resuming conversation */}
      {isLoadingChat && (
        <div className="chat-loading-banner" role="status">
          <span className="history-spinner" aria-hidden="true"></span>
          <span>Loading chat log...</span>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="messages-container" tabIndex={0} aria-label="Chat messages history">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">
              {isStudent ? <AcademicCapIcon size={44} /> : <BookOpenIcon size={44} />}
            </div>
            <h3 className="empty-title">
              {isStudent ? 'SDI Student AI Tutor' : 'SDI Instructor Assistant'}
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
                {getSuggestions().map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="prompt-chip"
                    onClick={() => sendMessage(prompt)}
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
                  {msg.role === 'user' ? (isStudent ? 'Alex (Student)' : 'Staff') : 'SDI AI Tutor'}
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

        {/* Active Tool Status Indicator */}
        {activeTool && (
          <ToolStatusPill
            toolName={activeTool.toolName}
            status={activeTool.status}
            message={activeTool.message}
          />
        )}

        {/* Error notification */}
        {error && (
          <div className="feedback-alert error" role="alert">
            <AlertTriangleIcon size={16} className="feedback-icon" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Controls */}
      <div className="chat-input-area">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="input-form"
        >
          <label htmlFor="tutor-chat-input" className="visually-hidden">
            Ask the SDI AI Tutor
          </label>
          <div className="input-wrapper">
            <textarea
              id="tutor-chat-input"
              ref={textareaRef}
              className="chat-textarea"
              placeholder={
                isStudent
                  ? 'Ask about course concepts, assignments, or due dates...'
                  : 'Ask about missing due dates, submissions, or draft content...'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              aria-describedby="input-hint"
            />
            <div className="input-actions">
              <span id="input-hint" className="input-keyboard-hint">
                Press <strong>Enter</strong> to send, <strong>Shift+Enter</strong> for newline
              </span>

              <div className="button-group">
                {isStreaming ? (
                  <button
                    type="button"
                    className="stop-button"
                    onClick={handleStop}
                    aria-label="Stop generating response"
                  >
                    <span className="stop-icon" aria-hidden="true">■</span> Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="send-button"
                    disabled={!input.trim()}
                    aria-label="Send message to AI Tutor"
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
