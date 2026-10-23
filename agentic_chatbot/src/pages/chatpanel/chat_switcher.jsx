import { useEffect, useRef, useState } from "react";
import "./chat_switcher.css";

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ChatSwitcher({
  chats,
  activeChatId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const menuRef = useRef(null);
  const renameInputRef = useRef(null);
  const newChatInputRef = useRef(null);

  const activeChat = chats.find((c) => c.id === activeChatId);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
        setRenamingId(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setRenamingId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  useEffect(() => {
    if (isNewChatModalOpen) {
      requestAnimationFrame(() => newChatInputRef.current?.focus());
    }
  }, [isNewChatModalOpen]);

  const startRename = (chat) => {
    setRenamingId(chat.id);
    setRenameDraft(chat.title);
  };

  const commitRename = () => {
    if (renamingId && renameDraft.trim()) {
      onRename(renamingId, renameDraft.trim());
    }
    setRenamingId(null);
  };

  const handleDelete = (e, chat) => {
    e.stopPropagation();
    if (chats.length <= 1) return;
    if (window.confirm(`Delete "${chat.title}"? This can't be undone.`)) {
      onDelete(chat.id);
    }
  };

  const openNewChatModal = () => {
    setIsOpen(false);
    setNewChatName("");
    setIsNewChatModalOpen(true);
  };

  const closeNewChatModal = () => setIsNewChatModalOpen(false);

  const confirmNewChat = () => {
    
    onNew(newChatName);
    setIsNewChatModalOpen(false);
  };

  return (
    <div className="chat-switcher" ref={menuRef}>
      <button
        type="button"
        className="chat-switcher-trigger"
        onClick={() => setIsOpen((open) => !open)}
        title="Switch chats"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
          <path
            d="M4 5h16M4 12h16M4 19h10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className="chat-switcher-trigger-label">
          {activeChat?.title || "New chat"}
        </span>
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" className="chat-switcher-chevron">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button
        type="button"
        className="chat-switcher-new-btn"
        onClick={openNewChatModal}
        title="New chat"
        aria-label="New chat"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="chat-switcher-menu">
          {chats.length === 0 ? (
            <div className="chat-switcher-empty">No chats yet</div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                className={`chat-switcher-item ${
                  chat.id === activeChatId ? "chat-switcher-item-active" : ""
                }`}
                onClick={() => {
                  if (renamingId === chat.id) return;
                  onSelect(chat.id);
                  setIsOpen(false);
                }}
              >
                {renamingId === chat.id ? (
                  <input
                    ref={renameInputRef}
                    className="chat-switcher-rename-input"
                    value={renameDraft}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <div className="chat-switcher-item-text">
                    <span className="chat-switcher-item-title">{chat.title}</span>
                    <span className="chat-switcher-item-time">
                      {relativeTime(chat.updatedAt)}
                    </span>
                  </div>
                )}

                <div className="chat-switcher-item-actions">
                  <button
                    type="button"
                    className="chat-switcher-item-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(chat);
                    }}
                    title="Rename"
                    aria-label={`Rename ${chat.title}`}
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
                      <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="chat-switcher-item-btn chat-switcher-item-btn-danger"
                    onClick={(e) => handleDelete(e, chat)}
                    title="Delete"
                    aria-label={`Delete ${chat.title}`}
                    disabled={chats.length <= 1}
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
                      <path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {isNewChatModalOpen && (
        <div className="chat-switcher-modal-backdrop" onClick={closeNewChatModal}>
          <div
            className="chat-switcher-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-chat-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="new-chat-modal-title" className="chat-switcher-modal-title">
              Name this chat
            </h2>
            <p className="chat-switcher-modal-subtitle">
              Each chat is stored separately, so it never overwrites another
              one's name or messages.
            </p>
            <input
              ref={newChatInputRef}
              className="chat-switcher-modal-input"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmNewChat();
                if (e.key === "Escape") closeNewChatModal();
              }}
              placeholder="New chat"
              maxLength={80}
            />
            <div className="chat-switcher-modal-actions">
              <button
                type="button"
                className="chat-switcher-modal-btn"
                onClick={closeNewChatModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="chat-switcher-modal-btn chat-switcher-modal-btn-primary"
                onClick={confirmNewChat}
              >
                Create chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
