import { lazy, Suspense } from "react";
import DOMPurify from "dompurify";
import "./message.css";

// Monaco + Ace together are the single biggest chunk of this app's
// bundle (see codepanel.jsx for the same lazy import). Loading them
// eagerly meant every page load paid for both editor engines even for
// people who never open a code block -- lazy() defers the fetch until
// the first code block actually needs to render, and Vite dedupes this
// against codepanel.jsx's import of the same module into one shared
// chunk rather than fetching it twice.
const CodeEditor = lazy(() => import("../editor/editor.jsx"));

// Simple placeholder shown for the brief window while the editor chunk
// downloads -- sized to roughly match a collapsed inline editor so the
// surrounding chat bubble doesn't visibly jump once it swaps in.
function EditorLoadingFallback() {
  return <div className="chat-code-editor-loading">Loading editor…</div>;
}

// Backend sends code wrapped in a per-language HTML-style tag, e.g.
// <python>...</python>, <react>...</react>, <sql>...</sql>. The tag name
// becomes the language label directly, so any language "just works"
// without a fixed whitelist.
//
// Whitespace/indentation inside the tag is preserved byte-for-byte (aside
// from a single leading/trailing newline immediately touching the tags,
// which is stripped the same way markdown ``` fences conventionally are)
// so the code renders exactly as the backend sent it.
const CODE_TAG_PATTERN = /<([a-zA-Z][\w-]*)>\n?([\s\S]*?)<\/\1>/g;

// Tag names that are real HTML elements the backend's prose might
// legitimately contain must never be treated as a code-language tag, or
// normal HTML would get shredded into code blocks.
//
// Extended to cover static visual markup -- svg (+ its child elements,
// since CODE_TAG_PATTERN matches ANY <tagname>...</tagname> pair, not
// just top-level ones, so a <path>/<circle>/<rect> nested inside an
// <svg> would otherwise ALSO get misread as its own code block), canvas,
// and layout/styling tags (div, section, span's block-level cousins,
// style). This intentionally does NOT include <script> -- scripts are a
// separate, not-yet-solved problem (see the note on SANITIZE_CONFIG
// below); adding it here would only stop it from being misparsed as
// code, it would still be silently stripped by DOMPurify afterwards.
const KNOWN_HTML_TAGS = new Set([
  "a", "b", "i", "u", "p", "br", "hr", "span", "div", "section", "figure",
  "strong", "em", "code", "pre", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "td", "th",
  "blockquote", "img",
  // Static visuals -- SVG shapes/paths/gradients and canvas, styled with
  // inline `style` attributes or a <style> block. No <script> involved,
  // so these render exactly the way a static image would: fixed at
  // render time, no redraw, no interaction driven by code.
  "svg", "path", "circle", "rect", "line", "polygon", "polyline",
  "ellipse", "g", "defs", "lineargradient", "radialgradient", "stop",
  "text", "tspan", "canvas", "style",
  // Less common SVG children -- still real markup, not code. "title" in
  // particular used to be missing here, which meant <title>...</title>
  // inside an <svg> (a completely normal a11y label) got misread as a
  // fake code block named "title" and spliced out of the SVG entirely,
  // corrupting the rendered image. foreignObject stays listed here too
  // (so it's parsed as markup, not code) but DOMPurify's SVG profile
  // still strips it afterward regardless -- see SANITIZE_CONFIG's note
  // on foreignObject smuggling.
  "title", "use", "symbol", "mask", "clippath", "pattern", "marker",
  "image", "foreignobject",
  // CHANGED: more ordinary text-level and semantic HTML tags. If the
  // formatter model uses any of these in a normal explanation, they must
  // NOT be misread as a "language" tag and turned into a code editor
  // block -- that was one cause of normal text showing up as code.
  // (<script> is still deliberately NOT listed, see note above.)
  "main", "article", "header", "footer", "nav", "aside", "address",
  "small", "mark", "sub", "sup", "s", "del", "ins", "kbd", "samp", "var",
  "abbr", "cite", "q", "time", "dl", "dt", "dd", "caption", "colgroup",
  "col", "tfoot", "details", "summary", "label", "center",
]);

// DOMPurify config used for assistant HTML. Three things matter here,
// verified against DOMPurify 3.4.15 directly (see the note on each) --
// don't assume any one of them is optional, each was checked to
// actually be load-bearing:
//
// 1. USE_PROFILES: { svg: true, svgFilters: true } -- DOMPurify's
//    default config is HTML-only and strips most SVG-specific
//    attributes (viewBox, d, cx/cy/r, stroke-*, fill, gradient stops,
//    etc.) even though the SVG *tags* themselves survive. Without this,
//    an <svg> block added to KNOWN_HTML_TAGS above renders as an empty,
//    attribute-stripped shell -- the tags get through, the actual
//    drawing instructions don't. This switches DOMPurify to its
//    SVG-aware attribute rules, which keep these while still stripping
//    anything genuinely dangerous (onclick=, javascript: URLs in
//    href/xlink:href, foreignObject smuggling, etc).
// 2. ADD_TAGS: ["style"] -- <style> is not in DOMPurify's default
//    allowed-tag list, so scoped/inline CSS shipped alongside an SVG or
//    div-based visual would otherwise just vanish.
// 3. FORCE_BODY: true -- ADD_TAGS alone is NOT enough to keep <style>;
//    verified directly (see conversation) that without this flag,
//    <style> is stripped before DOMPurify's own tag-allow logic even
//    sees it, regardless of ADD_TAGS. FORCE_BODY changes how DOMPurify
//    parses the incoming fragment in a way that stops this. If you ever
//    remove this flag while debugging, <style> silently disappears
//    again -- confirmed, not a guess.
//
// None of this reopens script execution: DOMPurify still strips
// <script> tags and event-handler attributes (onclick=, etc.)
// unconditionally, and dangerouslySetInnerHTML (used below) cannot
// execute an injected <script> tag even if one somehow survived --
// that's a browser-level rule, not something any of these DOMPurify
// options touch. This config is still strictly "render static
// HTML/SVG/CSS," never "run code."
const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  ADD_TAGS: ["style"],
  FORCE_BODY: true,
};

// A code block collapses to a live read-only preview (this many lines
// visible) once it exceeds this length; clicking it opens the full block
// in the side CodePanel instead of expanding inline.
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

// Splits raw HTML into an ordered list of either
// { type: "html", html } or { type: "code", lang, code } chunks, so code
// tags can be swapped out for a preview card while everything else is
// rendered as real HTML exactly as the backend sent it.
//
// IMPORTANT: the regex-based approach below scans for ANY
// <tagname>...</tagname> pair, so nesting matters. A <path> living
// inside an <svg> is matched as its own candidate first (regex scans
// left to right) -- it's only correctly left alone because "path" is
// now in KNOWN_HTML_TAGS. If the backend ever sends a tag name that
// collides with a language name AND is meant as real markup (unlikely,
// but e.g. a literal <g> used as an abbreviation somewhere in prose),
// this same ambiguity that existed before still exists -- this fix
// widens the allowlist, it doesn't change the underlying matching
// strategy.
export function splitHtmlAndCode(text) {
  const chunks = [];
  let lastIndex = 0;
  let match;
  let blockIndex = 0;

  CODE_TAG_PATTERN.lastIndex = 0;
  while ((match = CODE_TAG_PATTERN.exec(text)) !== null) {
    const [full, tagName, code] = match;

    if (KNOWN_HTML_TAGS.has(tagName.toLowerCase())) {
      // Not a language tag -- leave it as-is, it's real markup.
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

// Re-encodes edited code back through the same entity-escaping the backend
// uses, then rebuilds the full message string with the Nth code block's
// content replaced -- everything else (surrounding HTML) is left untouched.
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

// CHANGED: icon + size helpers for attached-document chips shown inside
// a user's chat bubble (same icons as the composer in input_box.jsx).
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

// A single code block's representation inside a chat bubble. Short blocks
// render as a small always-editable inline editor (same as before). Long
// blocks (> COLLAPSE_THRESHOLD_LINES) render as a static, read-only,
// syntax-highlighted preview card -- clicking it opens the full block in
// the docked CodePanel for viewing/editing, matching Claude.ai's artifact
// pattern instead of growing the chat bubble itself.
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

        // Skip empty/whitespace-only HTML chunks (e.g. the gap directly
        // between two adjacent code tags) so no stray empty wrapper renders.
        if (!chunk.html || chunk.html.trim() === "") return null;

        // Assistant replies come from the backend/LLM, not from trusted
        // static content, so they're sanitized before being injected as
        // real HTML -- this strips scripts, event handlers, and other
        // attack surface while preserving normal formatting markup AND
        // (via SANITIZE_CONFIG's svg profile) static SVG/canvas visuals.
        // No <script> tag can ever execute through this path regardless
        // of config -- dangerouslySetInnerHTML never runs injected
        // scripts, by browser design -- so this remains render-only,
        // non-interactive HTML, per the current scope.
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

/**
 * Scrollable message list: bubbles, per-message context checkboxes, the
 * typing indicator, and (for assistant replies) parsed HTML with embedded
 * code chunks. Long code blocks render as clickable preview cards that
 * open the docked CodePanel via onOpenPanel; edits to any block flow back
 * up through onCodeChange, which the parent ChatPanel uses to permanently
 * rewrite the owning message's stored text.
 *
 * CHANGED: a user's bubble now also shows chips for any attached
 * documents (msg.documents = [{ id, name, size }]) above the message text.
 */
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

                {/* CHANGED: attached documents (PDF, Word, Excel, ...) */}
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