import { useEffect, useRef, useState, lazy, Suspense } from "react";
import "./codepanel.css";

const CodeEditor = lazy(() => import("../editor/editor.jsx"));

function EditorLoadingFallback() {
  return <div className="code-panel-loading">Loading editor…</div>;
}

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH_RATIO = 0.75;
const DEFAULT_PANEL_WIDTH_RATIO = 0.52;
const PANEL_WIDTH_STORAGE_KEY = "chat_code_panel_width";

export default function CodePanel({
  isOpen,
  tabs,
  activeTabId,
  splitTabId,
  onActivateTab,
  onToggleSplit,
  onCloseTab,
  onChangeTab,
  onClose,
  editorType,
}) {
  const [copied, setCopied] = useState(false);

  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_STORAGE_KEY));
    if (stored && stored >= MIN_PANEL_WIDTH) return stored;
    return Math.round(window.innerWidth * DEFAULT_PANEL_WIDTH_RATIO);
  });

  const isDraggingWidth = useRef(false);

  const handleWidthDragStart = (e) => {
    e.preventDefault();
    isDraggingWidth.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const handleDragMove = (e) => {
      if (!isDraggingWidth.current) return;
      const maxWidth = window.innerWidth * MAX_PANEL_WIDTH_RATIO;
      const next = Math.min(
        Math.max(window.innerWidth - e.clientX, MIN_PANEL_WIDTH),
        maxWidth
      );
      setWidth(next);
    };

    const handleDragEnd = () => {
      if (isDraggingWidth.current) {
        isDraggingWidth.current = false;
        localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width));
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
    };
  }, [width]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;
  const splitTab = splitTabId ? tabs.find((t) => t.id === splitTabId) || null : null;

  const handleCopy = (tab) => {
    if (!tab) return;
    navigator.clipboard.writeText(tab.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="code-panel" style={{ width }}>
      <div
        className="code-panel-resize-handle"
        onMouseDown={handleWidthDragStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize code panel"
      />

      <div className="code-panel-header">
        <span className="code-panel-lang">Code Panel</span>

        <button
          className="code-panel-close"
          onClick={onClose}
          aria-label="Close code panel"
          title="Close"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="code-panel-body">
        <div className="code-panel-editor-area" style={{ flex: 1 }}>
          <EditorTabStrip
            tabs={tabs}
            activeTabId={activeTabId}
            splitTabId={splitTabId}
            onActivateTab={onActivateTab}
            onToggleSplit={onToggleSplit}
            onCloseTab={onCloseTab}
            onCopy={handleCopy}
            copied={copied}
          />

          <div className={`code-panel-editor-panes ${splitTab ? "code-panel-editor-panes-split" : ""}`}>
            <EditorPane
              tab={activeTab}
              editorType={editorType}
              onChange={onChangeTab}
              emptyMessage="Open a code block from chat to start editing here."
            />

            {splitTab && (
              <>
                <div className="code-panel-vertical-divider" />
                <EditorPane
                  tab={splitTab}
                  editorType={editorType}
                  onChange={onChangeTab}
                  emptyMessage=""
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditorTabStrip({ tabs, activeTabId, splitTabId, onActivateTab, onToggleSplit, onCloseTab, onCopy, copied }) {
  if (tabs.length === 0) {
    return (
      <div className="code-panel-tabstrip">
        <span className="code-panel-tab-empty">No code block open</span>
      </div>
    );
  }

  return (
    <div className="code-panel-tabstrip">
      <div className="code-panel-tabstrip-scroll">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`code-panel-tab ${tab.id === activeTabId ? "code-panel-tab-active" : ""} ${
              tab.id === splitTabId ? "code-panel-tab-split" : ""
            }`}
            onClick={() => onActivateTab(tab.id)}
            onDoubleClick={() => onToggleSplit(tab.id)}
            title={`${tab.title}${tab.id === splitTabId ? " (split)" : ""} — double-click to split`}
          >
            <span className="code-panel-tab-label">{tab.title}</span>
            <span
              className="code-panel-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              role="button"
              aria-label={`Close ${tab.title} tab`}
            >
              ×
            </span>
          </button>
        ))}
      </div>

      <div className="code-panel-tabstrip-actions">
        {tabs.length > 1 && (
          <button
            type="button"
            className="code-panel-split-toggle"
            onClick={() => onToggleSplit(splitTabId ? null : activeTabId)}
            title={splitTabId ? "Close split view" : "Split the active tab side-by-side with another"}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 4v16" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        )}

        <button className="code-panel-copy" onClick={() => onCopy(tabs.find((t) => t.id === activeTabId))}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function EditorPane({ tab, editorType, onChange, emptyMessage }) {
  if (!tab) {
    return emptyMessage ? (
      <div className="code-panel-empty-state">{emptyMessage}</div>
    ) : null;
  }

  return (
    <div className="code-panel-editor-wrap chat-code-editor-host" data-tab-id={tab.id}>
      <Suspense fallback={<EditorLoadingFallback />}>
        <CodeEditor
          lang={tab.lang}
          code={tab.code}
          editorType={editorType}
          onChange={(newCode) => onChange(tab.id, newCode)}
        />
      </Suspense>
    </div>
  );
}