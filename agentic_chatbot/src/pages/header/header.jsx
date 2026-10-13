import "./header.css";

/**
 * Top bar of the chat panel: assistant identity/status, code-panel
 * toggle, editor-engine switch, theme switch, context-mode switch, and
 * clear-chat. Purely presentational -- all state lives in ChatPanel and
 * is passed in as props.
 *
 * contextMode is now a purely client-side switch (no backend similarity
 * retrieval to configure -- there's no backend at all anymore):
 *  - "manual": the per-message checkboxes in message.jsx (and the "Send
 *    all as context" toggle in ChatPanel's context bar) decide what goes
 *    to Ollama on the next turn.
 *  - "auto": the whole conversation is always sent; checkboxes are
 *    disabled and shown as always-checked.
 */
export default function Header({
  assistantName,
  assistantSubtitle,
  isBusy,
  isThinking,
  editorType,
  onToggleEditorType,
  isCodePanelOpen,
  onToggleCodePanel,
  theme,
  onToggleTheme,
  contextMode,
  onToggleContextMode,
  onClearChat,
}) {
  return (
    <header className="chat-header-wrap">
      <div className="chat-header">
      <div className="chat-avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
          <path
            d="M12 3l1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9L12 3z"
            fill="currentColor"
          />
          <circle cx="18.5" cy="17" r="1.6" fill="currentColor" />
        </svg>
      </div>

      <div className="chat-header-text">
        <div className="chat-header-name">{assistantName}</div>

        <div className="chat-header-status">
          <span
            className={`chat-status-dot ${
              isBusy ? "chat-status-dot-active" : ""
            }`}
          />

          {isThinking ? "Thinking…" : assistantSubtitle}
        </div>
      </div>

      <button
        type="button"
        className="chat-editor-toggle"
        onClick={onToggleEditorType}
        aria-label={`Switch code editor to ${
          editorType === "monaco" ? "Ace" : "Monaco"
        }`}
        title={`Code editor: ${
          editorType === "monaco" ? "Monaco" : "Ace"
        } (click to switch)`}
      >
        {editorType === "monaco" ? "Monaco" : "Ace"}
      </button>

      <button
        type="button"
        className={`chat-terminal-toggle ${isCodePanelOpen ? "chat-terminal-toggle-active" : ""}`}
        onClick={onToggleCodePanel}
        aria-label={isCodePanelOpen ? "Close code panel" : "Open code panel"}
        title={isCodePanelOpen ? "Close code panel" : "Open code panel (opened code blocks land here)"}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 9l3 3-3 3M12 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {onClearChat && (
        <button
          type="button"
          className="chat-clear-toggle"
          onClick={onClearChat}
          aria-label="Clear this chat's messages"
          title="Clear this chat's messages (keeps the chat, just empties it)"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <button
        type="button"
        className="chat-theme-toggle"
        onClick={onToggleTheme}
        aria-label={
          theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
        }
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {theme === "dark" ? (
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
            <path
              d="M20 14.5A8.5 8.5 0 0110.2 4a7 7 0 109.8 10.5z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      </div>

      {/* Context mode row: manual (checkbox-based selection) vs auto
          (always send the whole conversation, checkboxes disabled). */}
      <div className="chat-context-mode-row">
        <div className="chat-context-mode-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={contextMode === "manual"}
            className={`chat-context-mode-btn ${
              contextMode === "manual" ? "chat-context-mode-btn-active" : ""
            }`}
            onClick={() => onToggleContextMode("manual")}
          >
            Manual context
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={contextMode === "auto"}
            className={`chat-context-mode-btn ${
              contextMode === "auto" ? "chat-context-mode-btn-active" : ""
            }`}
            onClick={() => onToggleContextMode("auto")}
          >
            Full context
          </button>
        </div>
      </div>
    </header>
  );
}