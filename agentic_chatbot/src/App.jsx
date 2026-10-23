import { useEffect, useRef, useState } from "react";
import ChatPanel from "./pages/chatpanel/chatpanel.jsx";
import CodePanel from "./pages/codepanel/codepanel.jsx";
import {
  createMessageTab,
  openTab,
  closeTab,
  updateTabCode,
} from "./pages/codepanel/codepanel_data.js";
import "./App.css";

const THEME_STORAGE_KEY = "chat_theme";
const EDITOR_TYPE_STORAGE_KEY = "chat_editor_type";
const CONTEXT_MODE_STORAGE_KEY = "chat_context_mode";


function App() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      return;
    }
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  };

  const [editorType, setEditorType] = useState("monaco");
  useEffect(() => {
    const stored = localStorage.getItem(EDITOR_TYPE_STORAGE_KEY);
    if (stored === "monaco" || stored === "ace") setEditorType(stored);
  }, []);

  const toggleEditorType = () => {
    setEditorType((prev) => {
      const next = prev === "monaco" ? "ace" : "monaco";
      localStorage.setItem(EDITOR_TYPE_STORAGE_KEY, next);
      return next;
    });
  };

  const [contextMode, setContextMode] = useState("manual");
  useEffect(() => {
    const stored = localStorage.getItem(CONTEXT_MODE_STORAGE_KEY);
    if (stored === "manual" || stored === "auto") setContextMode(stored);
  }, []);

  const handleToggleContextMode = (mode) => {
    setContextMode(mode);
    localStorage.setItem(CONTEXT_MODE_STORAGE_KEY, mode);
  };

  const [isCodePanelOpen, setIsCodePanelOpen] = useState(false);
  const [editorTabs, setEditorTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [splitTabId, setSplitTabId] = useState(null);

  const toggleCodePanel = () => setIsCodePanelOpen((open) => !open);
  const closeCodePanel = () => setIsCodePanelOpen(false);

 
  const handleOpenCodeBlock = ({ messageId, blockIndex, lang, code }) => {
    const tab = createMessageTab({ messageId, blockIndex, lang, code });
    setEditorTabs((prev) => {
      const result = openTab(prev, tab);
      setActiveTabId(result.activeTabId);
      return result.tabs;
    });
    setIsCodePanelOpen(true);
  };


  const handleCodeBlockEdited = ({ messageId, blockIndex, code }) => {
    const tabId = `message:${messageId}:${blockIndex}`;
    setEditorTabs((prev) => updateTabCode(prev, tabId, code));
  };

  const chatPanelApiRef = useRef(null);

  const handleChangeTab = (tabId, newCode) => {
    setEditorTabs((prev) => updateTabCode(prev, tabId, newCode));

    const tab = editorTabs.find((t) => t.id === tabId);
    if (!tab) return;

    chatPanelApiRef.current?.applyCodeEdit(tab.messageId, tab.blockIndex, newCode);
  };

  const handleActivateTab = (tabId) => setActiveTabId(tabId);

  const handleToggleSplit = (tabId) => setSplitTabId(tabId);

  const handleCloseTab = (tabId) => {
    setEditorTabs((prev) => {
      const result = closeTab(prev, tabId, activeTabId, splitTabId);
      setActiveTabId(result.activeTabId);
      setSplitTabId(result.splitTabId);
      return result.tabs;
    });
  };

  return (
    <div className={`layout-shell ${theme === "dark" ? "chat-theme-dark" : ""}`}>
      <div className="layout-body">
        <ChatPanel
          ref={chatPanelApiRef}
          theme={theme}
          onToggleTheme={toggleTheme}
          editorType={editorType}
          onToggleEditorType={toggleEditorType}
          contextMode={contextMode}
          onToggleContextMode={handleToggleContextMode}
          onOpenCodeBlock={handleOpenCodeBlock}
          onCodeBlockEdited={handleCodeBlockEdited}
          onToggleCodePanel={toggleCodePanel}
          isCodePanelOpen={isCodePanelOpen}
        />

        <CodePanel
          isOpen={isCodePanelOpen}
          tabs={editorTabs}
          activeTabId={activeTabId}
          splitTabId={splitTabId}
          onActivateTab={handleActivateTab}
          onToggleSplit={handleToggleSplit}
          onCloseTab={handleCloseTab}
          onChangeTab={handleChangeTab}
          onClose={closeCodePanel}
          editorType={editorType}
        />
      </div>
    </div>
  );
}

export default App;
