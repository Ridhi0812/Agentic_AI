import { useEffect, useId, useRef, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import AceEditor from "react-ace";
import "./editor.css";

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

export default function CodeEditor({
  lang,
  code,
  onChange,
  editorType = "monaco",
  readOnly = false,
}) {
  const [value, setValue] = useState(code);

  const aceId = useId();

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
