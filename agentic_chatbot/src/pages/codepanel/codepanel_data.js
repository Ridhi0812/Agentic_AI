// Data-shape helpers for CodePanel's multi-tab editor. Kept as plain
// functions (no React) so the tab-array logic is easy to reason about
// independently of component state. Only "message" tabs exist in this
// build -- there's no file tree/backend to source a "file" tab from.

// Human-friendly fallback label for a message-derived code block, which
// has no real filename of its own (it's an inline block, not a file) --
// e.g. "Python snippet", "React snippet".
function labelFromLang(lang) {
  if (!lang) return "Snippet";
  const known = {
    js: "JavaScript", javascript: "JavaScript",
    ts: "TypeScript", typescript: "TypeScript",
    jsx: "React", react: "React", tsx: "React",
    py: "Python", python: "Python",
    html: "HTML", css: "CSS", json: "JSON",
    sh: "Shell", bash: "Shell", shell: "Shell",
    sql: "SQL", yaml: "YAML", yml: "YAML",
    md: "Markdown", markdown: "Markdown",
    cpp: "C++", c: "C", java: "Java", go: "Go",
    rust: "Rust", rs: "Rust", php: "PHP", ruby: "Ruby", rb: "Ruby",
  };
  const display = known[lang.toLowerCase()] || lang;
  return `${display} snippet`;
}

// One open editor tab, sourced from a chat message's code block. Edits
// route back to ChatPanel (via its exposed applyCodeEdit ref method),
// which rewrites the owning message's stored text.
export function createMessageTab({ messageId, blockIndex, lang, code }) {
  return {
    id: `message:${messageId}:${blockIndex}`,
    source: "message",
    messageId,
    blockIndex,
    lang,
    title: labelFromLang(lang),
    code,
  };
}

// Opens a tab: if a tab with the same id is already open, just activates
// it (and refreshes its code/title, in case the message was edited
// since this tab was last open) instead of creating a duplicate.
export function openTab(tabs, newTab) {
  const existingIndex = tabs.findIndex((t) => t.id === newTab.id);
  if (existingIndex === -1) {
    return { tabs: [...tabs, newTab], activeTabId: newTab.id };
  }
  const next = tabs.slice();
  next[existingIndex] = { ...next[existingIndex], code: newTab.code, title: newTab.title, lang: newTab.lang };
  return { tabs: next, activeTabId: newTab.id };
}

// Closes a tab. If it was the active (or split) tab, picks a sensible
// neighbor to activate instead -- the tab that was to its left, or the
// new last tab if it was first.
export function closeTab(tabs, tabId, activeTabId, splitTabId) {
  const index = tabs.findIndex((t) => t.id === tabId);
  if (index === -1) {
    return { tabs, activeTabId, splitTabId };
  }

  const nextTabs = tabs.filter((t) => t.id !== tabId);

  const pickReplacement = (current) => {
    if (current !== tabId) return current;
    if (nextTabs.length === 0) return null;
    const fallbackIndex = Math.max(0, index - 1);
    return nextTabs[Math.min(fallbackIndex, nextTabs.length - 1)].id;
  };

  return {
    tabs: nextTabs,
    activeTabId: pickReplacement(activeTabId),
    splitTabId: splitTabId === tabId ? null : splitTabId,
  };
}

export function updateTabCode(tabs, tabId, newCode) {
  return tabs.map((t) => (t.id === tabId ? { ...t, code: newCode } : t));
}