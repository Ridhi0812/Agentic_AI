import { lazy, Suspense } from "react";
import DOMPurify from "dompurify";
import "./message.css";

const CodeEditor = lazy(() => import("../editor/editor.jsx"));

function EditorLoadingFallback() {
  return <div className="chat-code-editor-loading">Loading editor…</div>;
}

const CODE_TAG_PATTERN = /<([a-zA-Z][\w-]*)>\n?([\s\S]*?)<\/\1>/g;

const KNOWN_HTML_TAGS = new Set([
  "a", "b", "i", "u", "p", "br", "hr", "span", "div", "section", "figure",
  "strong", "em", "code", "pre", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "td", "th",
  "blockquote", "img",
  
  "svg", "path", "circle", "rect", "line", "polygon", "polyline",
  "ellipse", "g", "defs", "lineargradient", "radialgradient", "stop",
  "text", "tspan", "canvas", "style",
  
  "title", "use", "symbol", "mask", "clippath", "pattern", "marker",
  "image", "foreignobject",
  
  "main", "article", "header", "footer", "nav", "aside", "address",
  "small", "mark", "sub", "sup", "s", "del", "ins", "kbd", "samp", "var",
  "abbr", "cite", "q", "time", "dl", "dt", "dd", "caption", "colgroup",
  "col", "tfoot", "details", "summary", "label", "center",
]);

const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  ADD_TAGS: ["style"],
  FORCE_BODY: true,
};

export const COLLAPSE_THRESHOLD_LINES = 10;
const PREVIEW_LINES = 3;

function decodeHtmlEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function splitHtmlAndCode(text) {
  const chunks = [];
  let lastIndex = 0;
  let match;
  let blockIndex = 0;

  CODE_TAG_PATTERN.lastIndex = 0;
  while ((match = CODE_TAG_PATTERN.exec(text)) !== null) {
    const [full, tagName, code] = match;

    if (KNOWN_HTML_TAGS.has(tagName.toLowerCase())) {
      continue;
    }

    if (match.index > lastIndex) {
      chunks.push({
        type: "html",
        html: text.slice(lastIndex, match.index),
      });
    }

    chunks.push({
      type: "code",
      blockIndex: blockIndex++,
      tagName,
      lang: tagName.toLowerCase(),
      code: decodeHtmlEntities(code.replace(/^\n/, "").replace(/\n$/, "")),
    });

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    chunks.push({ type: "html", html: text.slice(lastIndex) });
  }

  return chunks;
}

function encodeHtmlEntities(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function rebuildTextWithEditedCode(text, blockIndex, newCode) {
  const chunks = splitHtmlAndCode(text);

  return chunks
    .map((chunk) => {
      if (chunk.type === "html") return chunk.html;

      const code = chunk.blockIndex === blockIndex ? newCode : chunk.code;

      return `<${chunk.tagName}>\n${encodeHtmlEntities(code)}\n</${chunk.tagName}>`;
    })
    .join("");
}
function getDocIcon(name = "") {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "📕";
  if (/\.(xlsx?|csv)$/.test(lower)) return "📊";
  if (/\.docx?$/.test(lower)) return "📘";
  return "📄";
}

function formatDocSize(size) {
  if (typeof size !== "number") return "";
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function CodeChunk({ chunk, editorType, actions }) {
  const lineCount = chunk.code.split("\n").length;
  const isLong = lineCount > COLLAPSE_THRESHOLD_LINES;

  if (!isLong) {
    return (
      <div className="chat-code-inline chat-code-editor-host">
        <div className="chat-code-inline-header">
          <span className="chat-code-lang">{chunk.lang}</span>
        </div>
        <div className="chat-code-inline-editor">
          <Suspense fallback={<EditorLoadingFallback />}>
            <CodeEditor
              lang={chunk.lang}
              code={chunk.code}
              editorType={editorType}
              onChange={(newCode) => actions.onChange(chunk.blockIndex, newCode)}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  const previewText = chunk.code.split("\n").slice(0, PREVIEW_LINES).join("\n");

  return (
    <div className="chat-code-preview-card chat-code-editor-host">
      <button
        type="button"
        className="chat-code-preview-open"
        onClick={() => actions.open(chunk)}
      >
        <div className="chat-code-preview-header">
          <span className="chat-code-lang">{chunk.lang}</span>
          <span className="chat-code-line-count">{lineCount} lines</span>
        </div>

        <div className="chat-code-preview-editor" aria-hidden="true">
          <Suspense fallback={<EditorLoadingFallback />}>
            <CodeEditor
              lang={chunk.lang}
              code={previewText}
              editorType={editorType}
              readOnly
            />
          </Suspense>
        </div>

        <div className="chat-code-preview-fade" />
        <span className="chat-code-preview-cta">Click to open</span>
      </button>
    </div>
  );
}

function HtmlContent({ text, editorType, messageId, onCodeChange, onOpenPanel }) {
  const chunks = splitHtmlAndCode(text || "");

  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk.type === "code") {
          return (
            <CodeChunk
              key={i}
              chunk={chunk}
              editorType={editorType}
              actions={{
                open: (c) =>
                  onOpenPanel({
                    messageId,
                    blockIndex: c.blockIndex,
                    lang: c.lang,
                    code: c.code,
                  }),
                onChange: (blockIndex, newCode) =>
                  onCodeChange(messageId, blockIndex, newCode),
              }}
            />
          );
        }

        if (!chunk.html || chunk.html.trim() === "") return null;
        return (
          <div
            key={i}
            className="chat-html-content"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(chunk.html, SANITIZE_CONFIG) }}
          />
        );
      })}
    </>
  );
}

export default function ChatMessages({
  messages,
  userId,
  isThinking,
  editorType,
  contextMode,
  onToggleIncluded,
  onCodeChange,
  onOpenPanel,
  onOpenLightbox,
  scrollRef,
}) {
  const isAutoContext = contextMode === "auto";

  return (
    <div className="chat-messages" ref={scrollRef}>
      {messages.map((msg, i) => {
        const isMine = msg.role === userId || msg.role === "user";
        const prev = messages[i - 1];
        const showTail = !prev || prev.role !== msg.role;

        return (
          <div
            key={msg.id}
            className={`chat-row ${isMine ? "chat-row-mine" : "chat-row-theirs"}`}
          >
            {isMine && (
              <input
                type="checkbox"
                className="chat-context-checkbox"
                checked={isAutoContext ? true : !!msg.included}
                disabled={isAutoContext}
                onChange={() => onToggleIncluded(msg.id)}
                title={
                  isAutoContext
                    ? "Auto context is on -- the backend selects relevant context automatically"
                    : msg.included
                    ? "Included as context for future messages"
                    : "Excluded from context for future messages"
                }
              />
            )}

            <div
              className={`chat-bubble ${
                isMine ? "chat-bubble-mine" : "chat-bubble-theirs"
              } ${showTail ? "chat-bubble-tail" : ""} ${
                msg.included ? "" : "chat-bubble-excluded"
              }`}
            >
              <div className="chat-bubble-content">
                {msg.imagePreviews && msg.imagePreviews.length > 0 && (
                  <div className="chat-image-grid">
                    {msg.imagePreviews.map((src, idx) => (
                      <img
                        key={idx}
                        src={src}
                        alt="Attached"
                        className="chat-image-thumb"
                        onClick={() => onOpenLightbox(src)}
                      />
                    ))}
                  </div>
                )}

                {}
                {msg.documents && msg.documents.length > 0 && (
                  <div className="chat-message-docs">
                    {msg.documents.map((doc, idx) => (
                      <div
                        key={doc.id || idx}
                        className="chat-message-doc"
                        title={doc.name}
                      >
                        <span className="chat-message-doc-icon">
                          {getDocIcon(doc.name)}
                        </span>
                        <span className="chat-message-doc-name">
                          {doc.name}
                        </span>
                        {typeof doc.size === "number" && (
                          <span className="chat-message-doc-size">
                            {formatDocSize(doc.size)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isMine ? (
                  msg.text && <p className="chat-bubble-text">{msg.text}</p>
                ) : (
                  <HtmlContent
                    text={msg.text}
                    editorType={editorType}
                    messageId={msg.id}
                    onCodeChange={onCodeChange}
                    onOpenPanel={onOpenPanel}
                  />
                )}
              </div>

              <span className="chat-bubble-time">{msg.time}</span>
            </div>

            {!isMine && (
              <input
                type="checkbox"
                className="chat-context-checkbox"
                checked={isAutoContext ? true : !!msg.included}
                disabled={isAutoContext}
                onChange={() => onToggleIncluded(msg.id)}
                title={
                  isAutoContext
                    ? "Auto context is on -- the backend selects relevant context automatically"
                    : msg.included
                    ? "Included as context for future messages"
                    : "Excluded from context for future messages"
                }
              />
            )}
          </div>
        );
      })}

      {isThinking && (
        <div className="chat-row chat-row-theirs">
          <div className="chat-bubble chat-bubble-theirs chat-bubble-tail chat-typing">
            <span className="chat-dot" />
            <span className="chat-dot" />
            <span className="chat-dot" />
          </div>
        </div>
      )}
    </div>
  );
}
