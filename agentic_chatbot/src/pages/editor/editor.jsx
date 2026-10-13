import { useEffect, useId, useRef, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import AceEditor from "react-ace";
import "./editor.css";

// Ace needs each language mode and theme imported explicitly (it doesn't
// bundle everything by default the way Monaco does). This is a reasonable
// common set covering the same languages MONACO_LANGUAGE_MAP supports.
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/mode-html";
import "ace-builds/src-noconflict/mode-css";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-sh";
import "ace-builds/src-noconflict/mode-sql";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/mode-markdown";
import "ace-builds/src-noconflict/mode-c_cpp";
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/mode-golang";
import "ace-builds/src-noconflict/mode-rust";
import "ace-builds/src-noconflict/mode-php";
import "ace-builds/src-noconflict/mode-ruby";
import "ace-builds/src-noconflict/mode-text";
import "ace-builds/src-noconflict/theme-twilight";
import "ace-builds/src-noconflict/ext-language_tools";

// Your custom tag names -> Monaco's built-in language ids. Anything not
// listed falls back to plaintext (Monaco still renders it fine, just
// without keyword/syntax coloring).
export const MONACO_LANGUAGE_MAP = {
  python: "python",
  py: "python",
  react: "javascript",
  jsx: "javascript",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  tsx: "typescript",
  html: "html",
  css: "css",
  json: "json",
  bash: "shell",
  sh: "shell",
  shell: "shell",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  markdown: "markdown",
  md: "markdown",
  cpp: "cpp",
  "c++": "cpp",
  c: "c",
  java: "java",
  go: "go",
  rust: "rust",
  rs: "rust",
  php: "php",
  ruby: "ruby",
  rb: "ruby",
};

// Same idea, but using Ace's mode names (imported above).
export const ACE_LANGUAGE_MAP = {
  python: "python",
  py: "python",
  react: "javascript",
  jsx: "javascript",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  tsx: "typescript",
  html: "html",
  css: "css",
  json: "json",
  bash: "sh",
  sh: "sh",
  shell: "sh",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  markdown: "markdown",
  md: "markdown",
  cpp: "c_cpp",
  "c++": "c_cpp",
  c: "c_cpp",
  java: "java",
  go: "golang",
  rust: "rust",
  rs: "rust",
  php: "php",
  ruby: "ruby",
  rb: "ruby",
};

const EDITOR_LINE_HEIGHT = 19;

/**
 * The raw, editable code surface -- either Monaco or Ace, filling
 * whatever height its parent container gives it. No collapse/expand,
 * no header, no copy button: those are handled by whoever embeds this
 * (a preview card in chat, or the full-height CodePanel).
 *
 * Props:
 *  - lang: language tag as sent by the backend (e.g. "python", "react")
 *  - code: the current code string (controlled from outside)
 *  - onChange(newCode): called on every edit
 *  - editorType: "monaco" | "ace". Defaults to "monaco".
 *  - readOnly: disables editing (used for the collapsed chat preview)
 */
export default function CodeEditor({
  lang,
  code,
  onChange,
  editorType = "monaco",
  readOnly = false,
}) {
  const [value, setValue] = useState(code);

  // Ace requires a unique `name` per instance; generated once via useId
  // (stable across re-renders) instead of Math.random() on every render,
  // which was needlessly giving Ace a new identity on every parent update.
  const aceId = useId();

  // Tracks whether the *last* value change came from typing inside this
  // editor (in which case we must NOT hand `value` back down -- Monaco/Ace
  // both own their internal buffer once mounted, and re-feeding them the
  // same text on every keystroke is what caused cursor jumps / scroll
  // resets / "dumped" characters) vs. from outside (a fresh backend reply,
  // or the message being reset elsewhere), where we DO need to sync.
  const isInternalEdit = useRef(false);

  useEffect(() => {
    if (isInternalEdit.current) {
      isInternalEdit.current = false;
      return;
    }
    setValue(code);
  }, [code]);

  const handleEditorChange = (newValue) => {
    const next = newValue ?? "";
    isInternalEdit.current = true;
    setValue(next);
    onChange?.(next);
  };

  if (editorType === "ace") {
    return (
      <AceEditor
        mode={ACE_LANGUAGE_MAP[lang] || "text"}
        theme="twilight"
        value={value}
        onChange={handleEditorChange}
        name={`ace-${aceId}`}
        width="100%"
        height="100%"
        fontSize={12.5}
        showPrintMargin={false}
        readOnly={readOnly}
        setOptions={{
          useWorker: false,
          tabSize: 2,
          wrap: true,
          showLineNumbers: true,
          highlightActiveLine: false,
        }}
        editorProps={{ $blockScrolling: true }}
      />
    );
  }

  return (
    <MonacoEditor
      height="100%"
      language={MONACO_LANGUAGE_MAP[lang] || "plaintext"}
      theme="vs-dark"
      value={value}
      onChange={handleEditorChange}
      options={{
        minimap: { enabled: false },
        fontSize: 12.5,
        fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
        lineHeight: EDITOR_LINE_HEIGHT,
        scrollBeyondLastLine: false,
        scrollbar: {
          alwaysConsumeMouseWheel: false,
        },
        wordWrap: "on",
        renderLineHighlight: "none",
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        padding: { top: 4, bottom: 4 },
        automaticLayout: true,
        readOnly,
        domReadOnly: readOnly,
      }}
    />
  );
}