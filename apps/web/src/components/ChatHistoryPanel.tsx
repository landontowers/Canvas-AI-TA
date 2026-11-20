import React from 'react';
import { PlusIcon, HistoryIcon, RefreshIcon, CloseIcon } from './Icons.js';

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

export function formatTimeOrDate(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface ChatHistoryPanelProps {
  showHistory: boolean;
  conversationId: string | null;
  conversationList: ConversationItem[];
  isLoadingHistory: boolean;
  onNewChat: () => void;
  onToggleHistory: () => void;
  onCloseHistory: () => void;
  onRefreshHistory: () => void;
  onSelectConversation: (conversationId: string) => void;
}

export const ChatHistoryPanel: React.FC<ChatHistoryPanelProps> = ({
  showHistory,
  conversationId,
  conversationList,
  isLoadingHistory,
  onNewChat,
  onToggleHistory,
  onCloseHistory,
  onRefreshHistory,
  onSelectConversation,
}) => {
  return (
    <>
      <div className="chat-toolbar" role="toolbar" aria-label="Conversation tools">
        <button
          type="button"
          className="toolbar-btn new-chat-btn"
          onClick={onNewChat}
          aria-label="Start a new chat"
          title="Start a new chat"
        >
          <PlusIcon size={14} className="btn-icon" />
          <span>New Chat</span>
        </button>

        <button
          type="button"
          className={`toolbar-btn history-toggle-btn ${showHistory ? 'active' : ''}`}
          onClick={onToggleHistory}
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
                onClick={onRefreshHistory}
                disabled={isLoadingHistory}
                aria-label="Refresh previous chats"
                title="Refresh list"
              >
                <RefreshIcon size={14} />
              </button>
              <button
                type="button"
                className="history-icon-btn"
                onClick={onCloseHistory}
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
                    onClick={() => onSelectConversation(conv.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectConversation(conv.id);
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
    </>
  );
};
