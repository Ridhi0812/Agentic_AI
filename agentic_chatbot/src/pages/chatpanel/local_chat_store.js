// Multi-chat, purely client-side persistence. There is still no backend
// chat_log / messages table -- but instead of one hardcoded storage key
// holding a single conversation, there are now two kinds of keys:
//
//   ollama_chats_index_v1                    -> [{ id, title, createdAt, updatedAt }, ...]
//   ollama_chat_messages_v1:<chatId>          -> [ message, message, ... ]
//
// The index is the "chat list" (title + timestamps only, so listing
// chats never has to load every conversation's full message array just
// to render a sidebar/dropdown). Each chat's actual messages live under
// their own key, keyed by id, loaded on demand when that chat becomes
// active.
//
// Images inside messages are stored as base64 data: URIs (never blob:
// object URLs -- those only live for the current page and break on
// reload), so a chat's message array is always safe to
// JSON.stringify/parse as-is.

const INDEX_KEY = "ollama_chats_index_v1";
const MESSAGES_KEY_PREFIX = "ollama_chat_messages_v1:";
const ACTIVE_CHAT_KEY = "ollama_active_chat_v1";

const messagesKey = (chatId) => `${MESSAGES_KEY_PREFIX}${chatId}`;

function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to read chat index:", error);
    return [];
  }
}

function writeIndex(index) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.error("Failed to save chat index:", error);
  }
}

// Chats are always handed back newest-first, the way a chat list expects.
function sortedByRecency(index) {
  return [...index].sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );
}

/** List every chat (id/title/timestamps only), most recently updated first. */
export function listChats() {
  return sortedByRecency(readIndex());
}

/** Create a new, empty chat entry in the index and return its id. Does
 *  not write a messages key -- callers write that separately (typically
 *  right away, via saveChatMessages) once they have an initial message
 *  list (e.g. a greeting).
 *
 *  Pass isManualTitle: true when `title` came directly from the user
 *  (e.g. typed into a "name this chat" dialog) so saveChatMessages'
 *  auto-titling never overwrites it once real messages start coming in
 *  -- same protection renameChat gives an existing chat. */
export function createChat(title = "New chat", { isManualTitle = false } = {}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const index = readIndex();
  index.push({ id, title, createdAt: now, updatedAt: now, isManualTitle });
  writeIndex(index);
  return id;
}

export function loadChatMessages(chatId) {
  if (!chatId) return null;
  try {
    const raw = localStorage.getItem(messagesKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error("Failed to read messages for chat", chatId, error);
    return null;
  }
}

// Auto-titling: once a chat has a first user message and still has its
// placeholder title, derive a short title from it -- the same UX
// shorthand most chat apps use instead of asking the user to name every
// new thread up front. Never overwrites a title the user set manually
// (renameChat marks the chat so this won't clobber it -- see isManual).
function deriveTitle(messages) {
  const firstUserMessage = messages.find((m) => m.role === "user" && m.text?.trim());
  if (!firstUserMessage) return null;
  const text = firstUserMessage.text.trim().replace(/\s+/g, " ");
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

/** Persist a chat's full message list, and bump its updatedAt (and, if
 *  it still has an auto-derived/placeholder title, refresh that title
 *  from the first user message). */
export function saveChatMessages(chatId, messages) {
  if (!chatId) return;
  try {
    localStorage.setItem(messagesKey(chatId), JSON.stringify(messages));
  } catch (error) {
    // Most likely quota exceeded (e.g. a lot of large base64 images) --
    // not fatal, the in-memory conversation still works for this tab,
    // it just won't survive a reload.
    console.error("Failed to save messages for chat", chatId, error);
  }

  const index = readIndex();
  const entry = index.find((c) => c.id === chatId);
  if (!entry) return; // chat was deleted out from under this save; ignore

  entry.updatedAt = new Date().toISOString();
  if (!entry.isManualTitle) {
    const derived = deriveTitle(messages);
    if (derived) entry.title = derived;
  }
  writeIndex(index);
}

/** User-driven rename. Marks the chat so auto-titling never overwrites
 *  it again. */
export function renameChat(chatId, title) {
  const trimmed = title.trim();
  if (!trimmed) return;
  const index = readIndex();
  const entry = index.find((c) => c.id === chatId);
  if (!entry) return;
  entry.title = trimmed;
  entry.isManualTitle = true;
  writeIndex(index);
}

export function deleteChat(chatId) {
  const index = readIndex().filter((c) => c.id !== chatId);
  writeIndex(index);
  localStorage.removeItem(messagesKey(chatId));
  if (getActiveChatId() === chatId) {
    localStorage.removeItem(ACTIVE_CHAT_KEY);
  }
}

export function getActiveChatId() {
  return localStorage.getItem(ACTIVE_CHAT_KEY);
}

export function setActiveChatId(chatId) {
  if (chatId) {
    localStorage.setItem(ACTIVE_CHAT_KEY, chatId);
  } else {
    localStorage.removeItem(ACTIVE_CHAT_KEY);
  }
}