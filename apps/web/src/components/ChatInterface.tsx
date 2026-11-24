import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Citation, StreamEvent } from '@virtual-ta/core';
import { ChatHistoryPanel, ConversationItem } from './ChatHistoryPanel.js';
import {
  extractTextFromFile,
  ExtractedDraftResult,
  MAX_DRAFT_CHARS,
} from '../utils/extractDraftText.js';
import {
  ChatMessageList,
  ChatMessage,
  ActiveToolStatus,
  CrisisResourceInfo,
  PracticeCardItem,
} from './ChatMessageList.js';

export type { ConversationItem, ChatMessage, CrisisResourceInfo, PracticeCardItem };

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
  initialDraftPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  personaId,
  courseId,
  currentPageTitle,
  pageContext,
  authToken,
  initialDraftPrompt,
  onConsumeInitialPrompt,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveToolStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState('');

  // Conversation history & practice check state
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [conversationList, setConversationList] = useState<ConversationItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isLoadingChat, setIsLoadingChat] = useState<boolean>(false);
  const [practiceCards, setPracticeCards] = useState<PracticeCardItem[] | null>(null);
  const [practiceTopic, setPracticeTopic] = useState<string>('');
  const [isLoadingPractice, setIsLoadingPractice] = useState<boolean>(false);
  const [attachedDraft, setAttachedDraft] = useState<ExtractedDraftResult | null>(null);
  const [isExtractingDraft, setIsExtractingDraft] = useState<boolean>(false);
  const [courseStatusBanner, setCourseStatusBanner] = useState<{
    kind: 'off' | 'logistics' | 'blackout';
    message: string;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isStudent = personaId === 'demo_student';

  useEffect(() => {
    if (initialDraftPrompt) {
      setInput(initialDraftPrompt);
      onConsumeInitialPrompt?.();
      textareaRef.current?.focus();
    }
  }, [initialDraftPrompt, onConsumeInitialPrompt]);

  useEffect(() => {
    if (!isStudent) {
      setCourseStatusBanner(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/courses/${encodeURIComponent(courseId)}/settings`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            setting?: 'full' | 'logistics_only' | 'off';
            blackoutStart?: string | null;
            blackoutEnd?: string | null;
          } | null,
        ) => {
          if (cancelled || !data) return;
          if (data.setting === 'off') {
            setCourseStatusBanner({
              kind: 'off',
              message: 'Virtual TA is currently turned off by your instructor for this course.',
            });
            return;
          }
          if (data.blackoutStart && data.blackoutEnd) {
            const now = Date.now();
            const start = Date.parse(data.blackoutStart);
            const end = Date.parse(data.blackoutEnd);
            if (!Number.isNaN(start) && !Number.isNaN(end) && now >= start && now <= end) {
              setCourseStatusBanner({
                kind: 'blackout',
                message: `Exam/Quiz Blackout active until ${new Date(end).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. Only logistics questions are available.`,
              });
              return;
            }
          }
          if (data.setting === 'logistics_only') {
            setCourseStatusBanner({
              kind: 'logistics',
              message: 'Logistics Only mode: deadlines, grades, and syllabus policies are enabled.',
            });
            return;
          }
          setCourseStatusBanner(null);
        },
      )
      .catch(() => {
        // Non-blocking
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, isStudent, authToken]);

  const handleExportStudyNotes = () => {
    if (messages.length === 0) return;
    const lines: string[] = [
      `# Virtual TA Study Notes (${courseId})`,
      `_Exported ${new Date().toLocaleString()}_`,
      '',
    ];
    for (const m of messages) {
      const speaker = m.role === 'user' ? 'Student' : 'Virtual TA';
      lines.push(`## ${speaker}`);
      lines.push(m.content);
      lines.push('');
    }
    const md = lines.join('\n');
    try {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `virtual-ta-study-notes-${courseId}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setScreenReaderAnnouncement('Exported study notes as Markdown.');
    } catch {
      void navigator.clipboard?.writeText(md);
      setScreenReaderAnnouncement('Copied study notes to clipboard.');
    }
  };

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

  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setActiveTool(null);
    setShowHistory(false);
    setPracticeCards(null);
    void loadConversationList();
  }, [personaId, courseId, loadConversationList]);

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

  const handleNewChat = () => {
    if (isStreaming) {
      handleStop();
    }
    setMessages([]);
    setConversationId(null);
    setError(null);
    setActiveTool(null);
    setShowHistory(false);
    setPracticeCards(null);
    setScreenReaderAnnouncement('Started a new conversation.');
    textareaRef.current?.focus();
  };

  const handleDeleteConversation = async (targetId: string) => {
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(targetId)}?personaId=${encodeURIComponent(personaId)}`,
        {
          method: 'DELETE',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        },
      );
      if (res.ok) {
        setConversationList((prev) => prev.filter((c) => c.id !== targetId));
        if (conversationId === targetId) {
          setMessages([]);
          setConversationId(null);
        }
      }
    } catch {
      // ignore delete error
    }
  };

  const handleRateMessage = async (messageId: string, rating: 'up' | 'down') => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, rating } : m)));
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          conversationId: conversationId || 'unsaved',
          messageId,
          courseId,
          rating,
          personaId,
        }),
      });
    } catch {
      // non-blocking telemetry
    }
  };

  const handleOpenPracticeCheck = async () => {
    setIsLoadingPractice(true);
    setError(null);
    try {
      const res = await fetch('/api/practice-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          courseId,
          personaId,
          topic: currentPageTitle,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { topic?: string; cards?: PracticeCardItem[] };
      setPracticeTopic(data.topic || currentPageTitle);
      setPracticeCards(data.cards || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPracticeCards(null);
    } finally {
      setIsLoadingPractice(false);
    }
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
      const loadedMsgs: ChatMessage[] = rawMsgs.map(
        (m: {
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
        }),
      );

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

  const handleAttachDraft = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsExtractingDraft(true);
    setError(null);
    try {
      const extracted = await extractTextFromFile(file);
      setAttachedDraft(extracted);
      if (!input.trim()) {
        setInput(
          isStudent
            ? 'Please check my attached draft against the rubric.'
            : 'Please review the attached document.',
        );
      }
      setScreenReaderAnnouncement(
        `Attached draft ${extracted.name} (${extracted.charCount} characters).`,
      );
      textareaRef.current?.focus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExtractingDraft(false);
    }
  };

  const sendMessage = async (textToSend?: string) => {
    const rawPrompt = (textToSend !== undefined ? textToSend : input).trim();
    const draftToAttach = textToSend === undefined ? attachedDraft : null;
    if (!rawPrompt && !draftToAttach) return;
    if (isStreaming) return;

    const messageContent = draftToAttach
      ? `${rawPrompt || 'Please check my attached draft against the rubric.'}\n\n<attached_draft filename="${draftToAttach.name}">\n${draftToAttach.text}\n</attached_draft>`
      : rawPrompt;

    setInput('');
    if (draftToAttach) setAttachedDraft(null);
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
                    ? `Virtual TA finished responding: ${accumulatedAssistantText.slice(0, 150)}...`
                    : 'Virtual TA finished responding.',
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
      void sendMessage();
    }
  };

  const practiceSuggestion = 'Quiz me with practice cards on this topic.';

  const suggestions = isStudent
    ? [
        'When is Safety Lab 1 due?',
        'Plan my study week across all classes.',
        practiceSuggestion,
        'Help me check my Safety Lab 1 draft against the rubric.',
        'I am stuck on firearm nomenclature and barrel twist.',
        'What does the syllabus say about late submissions?',
        'Calculate bullet energy for a 55gr bullet at 3100 fps',
      ]
    : [
        'Which assignments are missing due dates?',
        'Summarize student submission stats for Safety Lab 1.',
        'Draft an announcement reminding students about firearm safety.',
        'Give me an overview of the gradebook distribution.',
      ];

  return (
    <div className="chat-interface" role="region" aria-label="Virtual TA Chat">
      <div aria-live="polite" aria-atomic="false" className="visually-hidden">
        {screenReaderAnnouncement}
      </div>

      <ChatHistoryPanel
        showHistory={showHistory}
        isStudent={isStudent}
        conversationId={conversationId}
        conversationList={conversationList}
        isLoadingHistory={isLoadingHistory}
        onNewChat={handleNewChat}
        onToggleHistory={() => {
          setShowHistory((prev) => !prev);
          if (!showHistory) {
            void loadConversationList();
          }
        }}
        onCloseHistory={() => setShowHistory(false)}
        onRefreshHistory={() => void loadConversationList()}
        onSelectConversation={(id) => void handleSelectConversation(id)}
        onDeleteConversation={(id) => void handleDeleteConversation(id)}
        onOpenPracticeCheck={() => void handleOpenPracticeCheck()}
        canExportChat={messages.length > 0}
        onExportChat={handleExportStudyNotes}
      />

      {courseStatusBanner && (
        <div
          className={`course-status-banner ${courseStatusBanner.kind}`}
          role="status"
          aria-live="polite"
        >
          {courseStatusBanner.message}
        </div>
      )}

      {isLoadingChat && (
        <div className="chat-loading-banner" role="status">
          <span className="history-spinner" aria-hidden="true"></span>
          <span>Loading chat log...</span>
        </div>
      )}

      <ChatMessageList
        messages={messages}
        isStudent={isStudent}
        isStreaming={isStreaming}
        currentPageTitle={currentPageTitle}
        suggestions={suggestions}
        activeTool={activeTool}
        error={error}
        messagesEndRef={messagesEndRef}
        practiceCards={practiceCards}
        practiceTopic={practiceTopic}
        isLoadingPractice={isLoadingPractice}
        onClosePractice={() => setPracticeCards(null)}
        onSelectSuggestion={(prompt) => {
          if (prompt === practiceSuggestion) {
            void handleOpenPracticeCheck();
            return;
          }
          void sendMessage(prompt);
        }}
        onRateMessage={(msgId, rating) => void handleRateMessage(msgId, rating)}
      />

      <div className="chat-input-area">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className="input-form"
        >
          <label htmlFor="virtual-ta-chat-input" className="visually-hidden">
            Ask the SDI Virtual TA
          </label>
          <div className="input-wrapper">
            {attachedDraft && (
              <div className="attached-draft-chip" role="status" aria-label="Attached draft">
                <div className="attached-draft-meta">
                  <strong>{attachedDraft.name}</strong>
                  <span>({attachedDraft.charCount} chars)</span>
                  {attachedDraft.truncated && (
                    <span className="attached-draft-warn">
                      Truncated to {MAX_DRAFT_CHARS} chars
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="attached-draft-remove"
                  onClick={() => setAttachedDraft(null)}
                  aria-label="Remove attached draft"
                >
                  Remove
                </button>
              </div>
            )}
            <textarea
              id="virtual-ta-chat-input"
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
                <input
                  ref={draftInputRef}
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.docx,.pdf"
                  onChange={(e) => void handleAttachDraft(e)}
                  aria-label="Upload draft file"
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="attach-draft-btn"
                  onClick={() => draftInputRef.current?.click()}
                  disabled={isExtractingDraft}
                  aria-label="Attach document"
                  title="Extract text from .txt, .md, .docx, or .pdf"
                >
                  {isExtractingDraft ? 'Reading...' : isStudent ? 'Attach Draft' : 'Attach Doc'}
                </button>
                {isStreaming ? (
                  <button
                    type="button"
                    className="stop-button"
                    onClick={handleStop}
                    aria-label="Stop generating response"
                  >
                    <span className="stop-icon" aria-hidden="true">
                      ■
                    </span>{' '}
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="send-button"
                    disabled={!input.trim() && !attachedDraft}
                    aria-label="Send message to Virtual TA"
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
