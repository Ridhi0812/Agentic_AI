import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Header from "../header/header.jsx";
import ChatMessages, {
  rebuildTextWithEditedCode,
} from "../message/message.jsx";
import InputBox from "../input_box/input_box.jsx";
import ChatSwitcher from "./chat_switcher.jsx";
import "./chatpanel.css";
import { model_endpoint, chat_endpoint } from "../ip_dependencies.js";
import {
  listChats,
  createChat,
  loadChatMessages,
  saveChatMessages,
  renameChat,
  deleteChat,
  getActiveChatId,
  setActiveChatId as persistActiveChatId,
} from "./local_chat_store.js";

const MODEL_STORAGE_KEY = "chat_selected_model";

// CHANGED: documents (PDF, Word, Excel, CSV, text, code) ke liye limits.
// Ye backend (conversation.py) ki limits se match karti hain.
const DOC_EXTENSIONS = [
  ".pdf", ".docx", ".xlsx", ".xls", ".csv", ".txt", ".md", ".json",
  ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".xml",
  ".yaml", ".yml", ".ini", ".log",
];
const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_DOCS = 5;

const isDocFile = (file) =>
  DOC_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

const DEFAULT_GREETING = {
  id: "m1",
  role: "assistant",
  text: "Hi! Ask me anything — I can format **bold**, lists, and code.",
  time: "9:41 AM",
  createdAt: new Date().toISOString(),
  included: true,
};

/**
 * Chatbot-only build. Everything that depended on the old backend
 * (login/auth, the chat_log/messages graph DB, the per-chat file tree,
 * the terminal websocket) is gone.
 *
 * There can be any number of separate conversations now ("chats"), each
 * with its own id, title, and message list, all living in this browser's
 * localStorage (see local_chat_store.js) rather than a backend DB. Only
 * one chat is "active" (rendered, and the one new messages get appended
 * to) at a time -- see ChatSwitcher for how the user moves between them.
 * Sending a message still works exactly the same way as before: on every
 * turn, the currently-active chat's "included" messages go to the
 * backend's /chat endpoint -- see buildOllamaMessages() below for exactly
 * how they're turned into the { role, content } shape Ollama expects.
 *
 * CHANGED: the composer now accepts two kinds of attachments:
 *   - images     -> sent inside the message's `images` field (vision)
 *   - documents  -> sent in the top-level `documents` field of the
 *                   payload as [{ name, base64 }], which is exactly
 *                   what conversation.py's prepare_document_context()
 *                   reads and extracts text from.
 */
const ChatPanel = forwardRef(function ChatPanel({
  onOpenCodeBlock,
  onCodeBlockEdited,
  theme,
  onToggleTheme,
  contextMode,
  onToggleContextMode,
  onToggleCodePanel,
  isCodePanelOpen,
  editorType,
  onToggleEditorType,
  onClearChat,
  user = { id: "user", name: "You", username: "you" },
  assistant = { id: "assistant", name: "AI Assistant", username: "assistant" },
  assistantSubtitle = "Ready when you are",
}, ref) {
  // Ensures a chat exists and is marked active before first render --
  // runs at most once (lazy useState initializer), and any chat it
  // creates is visible to the chats/messages initializers below since
  // they run synchronously afterwards, in the same render.
  const ensureActiveChat = () => {
    const existing = listChats();
    let activeId = getActiveChatId();

    if (activeId && existing.some((c) => c.id === activeId)) {
      return activeId;
    }
    if (existing.length > 0) {
      persistActiveChatId(existing[0].id);
      return existing[0].id;
    }

    const id = createChat("New chat");
    saveChatMessages(id, [DEFAULT_GREETING]);
    persistActiveChatId(id);
    return id;
  };

  const [activeChatId, setActiveChatId] = useState(ensureActiveChat);
  const [chats, setChats] = useState(() => listChats());
  const [messages, setMessages] = useState(
    () => loadChatMessages(activeChatId) ?? [DEFAULT_GREETING]
  );

  // Tracks which chat id the current `messages` state actually belongs
  // to. This is the fix for a real bug: switching chats used to be two
  // separate `useEffect`s (one reacting to activeChatId to persist
  // `messages`, another reacting to activeChatId to reload `messages`).
  // React batches setChats()+setActiveChatId() into a single render, so
  // for one commit `activeChatId` pointed at the *new* chat while
  // `messages` still held the *old* chat's content -- and the
  // persistence effect (which ran first) would save that mismatched
  // pair, overwriting the new chat's storage key with the old chat's
  // messages (and, via title auto-derivation, its title too). That's
  // what caused a freshly created chat to instantly "adopt" the
  // previous chat's name and content.
  //
  // The fix: never let messages and activeChatId change independently.
  // Every switch goes through switchToChat() below, which updates this
  // ref and calls setMessages/setActiveChatId together, synchronously,
  // in the same handler -- so the persistence effect can simply check
  // "do these two actually match?" before ever writing to storage.
  const loadedChatIdRef = useRef(activeChatId);

  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  // Each entry: { id, file, previewUrl (data: URI), base64 }
  const [attachedImages, setAttachedImages] = useState([]);

  // CHANGED: attached documents. Each entry: { id, name, size, base64 }
  const [attachedDocs, setAttachedDocs] = useState([]);

  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  const [maxTokens, setMaxTokens] = useState(1024);
  const MIN_TOKENS = 64;
  const MAX_TOKENS = 4096;

  // Currently expanded image, shown fullscreen in the lightbox. Null when
  // no lightbox should be rendered.
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const modelMenuRef = useRef(null);

  const isBusy = isThinking;
  const isAutoContext = contextMode === "auto";

  const includedCount = messages.filter((m) => m.included).length;
  const allIncluded = messages.length > 0 && includedCount === messages.length;
  const noneIncluded = includedCount === 0;

  // Loads a different chat into view. Everything here happens
  // synchronously, in one call, so `messages` and `activeChatId` are
  // never briefly out of sync the way they were with the old two-effect
  // approach (see loadedChatIdRef's comment above).
  const switchToChat = (id) => {
    persistActiveChatId(id);
    loadedChatIdRef.current = id;
    setMessages(loadChatMessages(id) ?? [DEFAULT_GREETING]);
    setDraft("");
    setAttachedImages([]);
    setAttachedDocs([]); // CHANGED
    setIsThinking(false);
    setActiveChatId(id);
  };

  // Persist the active chat's messages to localStorage whenever they
  // change, and refresh the chat list (titles/timestamps may have
  // changed -- saveChatMessages auto-derives a title from the first user
  // message and bumps updatedAt). Guarded by loadedChatIdRef so a save
  // is never attempted with a (chatId, messages) pair that don't
  // actually belong together. imagePreviews are data: URIs (not blob:
  // object URLs), so the messages array is always safe to
  // JSON.stringify as-is -- see addFiles below for why.
  useEffect(() => {
    if (loadedChatIdRef.current !== activeChatId) return;
    saveChatMessages(activeChatId, messages);
    setChats(listChats());
  }, [activeChatId, messages]);

  // Auto-scroll to the latest message, but only when a message is
  // actually *added* -- not on every content change. Editing code in the
  // panel calls setMessages on every keystroke (to permanently persist
  // the edit), which would otherwise re-trigger this effect and yank the
  // chat scroll position back to the bottom while you're mid-edit.
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    const grew = messages.length > prevMessageCount.current;
    prevMessageCount.current = messages.length;

    if (grew || isThinking) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isThinking]);

  // Fetch available models on mount (i.e. on every page refresh), and
  // restore whatever the user last picked from localStorage.
  useEffect(() => {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY);
    if (stored) setSelectedModel(stored);

    setIsLoadingModels(true);
    fetch(model_endpoint)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        const rawList = Array.isArray(data.models) ? data.models : [];
        // The backend may return bare strings or Ollama-style objects
        // ({ name, model, size, ... }) -- pull just the name out for
        // the picker either way.
        const list = rawList
          .map((m) => (typeof m === "string" ? m : m.name ?? m.model))
          .filter(Boolean);
        setModels(list);

        // Keep the stored choice if it's still valid; otherwise fall
        // back to the first available model.
        setSelectedModel((prev) => {
          if (prev && list.includes(prev)) return prev;
          return list[0] ?? "";
        });
      })
      .catch((error) => {
        console.error("Failed to fetch models:", error);
      })
      .finally(() => setIsLoadingModels(false));
  }, []);

  // Close the model popover on outside click or Escape.
  useEffect(() => {
    if (!isModelMenuOpen) return;

    const handleClickOutside = (e) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target)) {
        setIsModelMenuOpen(false);
      }
    };

    const handleEscape = (e) => {
      if (e.key === "Escape") setIsModelMenuOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isModelMenuOpen]);

  const handleModelSelect = (value) => {
    setSelectedModel(value);
    localStorage.setItem(MODEL_STORAGE_KEY, value);
    setIsModelMenuOpen(false);
  };

  // Optional per-model subtitle, shown in the popover the way Claude.ai
  // shows "Most efficient for everyday tasks" etc. under each option.
  // Falls back to nothing if a model isn't in this map (e.g. any model
  // name Ollama reports that we don't specifically recognize).
  const MODEL_DESCRIPTIONS = {
    "llama3.1": "Meta's general-purpose model",
    "llama3": "Meta's general-purpose model",
    "mistral": "Fast, lightweight, solid all-rounder",
    "codellama": "Tuned for code",
    "llava": "Vision + language (image understanding)",
    "gemma2": "Google's open-weight model",
    "qwen2.5": "Strong at reasoning and code",
  };

  // Reads a File into { dataUrl, base64 }. `base64` is the raw payload
  // (no "data:...;base64," prefix) -- exactly what Ollama's `images`
  // field on a chat message expects, and what the backend's `documents`
  // field expects too. `dataUrl` is the same bytes with the prefix
  // restored, safe to use directly as an <img src> AND safe to
  // JSON.stringify into localStorage (unlike a blob: object URL, which
  // stops working the moment the page reloads).
  const fileToDataAndBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        resolve({ dataUrl, base64: dataUrl.split(",")[1] });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  // CHANGED: replaces the old image-only addImageFiles().
  // Shared by both the file picker and clipboard paste.
  //   - images      -> attachedImages (sent to Ollama's vision `images`)
  //   - documents   -> attachedDocs   (sent to the backend `documents`)
  //   - anything else is rejected with a visible message instead of
  //     being silently dropped (the old behaviour).
  const addFiles = async (files) => {
    if (files.length === 0) return;

    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const docFiles = files.filter(
      (f) => !f.type.startsWith("image/") && isDocFile(f)
    );
    const rejected = files.filter(
      (f) => !imageFiles.includes(f) && !docFiles.includes(f)
    );

    if (rejected.length > 0) {
      alert(`Unsupported file type: ${rejected.map((f) => f.name).join(", ")}`);
    }

    if (imageFiles.length > 0) {
      const newImages = await Promise.all(
        imageFiles.map(async (file) => {
          const { dataUrl, base64 } = await fileToDataAndBase64(file);
          return {
            id: crypto.randomUUID(),
            file,
            previewUrl: dataUrl,
            base64,
          };
        })
      );
      setAttachedImages((prev) => [...prev, ...newImages]);
    }

    if (docFiles.length > 0) {
      const tooBig = docFiles.filter((f) => f.size > MAX_DOC_BYTES);
      if (tooBig.length > 0) {
        alert(
          `These files are over the 5 MB limit: ${tooBig
            .map((f) => f.name)
            .join(", ")}`
        );
      }

      const slotsLeft = Math.max(0, MAX_DOCS - attachedDocs.length);
      const okFiles = docFiles
        .filter((f) => f.size <= MAX_DOC_BYTES)
        .slice(0, slotsLeft);

      if (docFiles.length - tooBig.length > slotsLeft) {
        alert(`You can attach up to ${MAX_DOCS} documents at a time.`);
      }

      const newDocs = await Promise.all(
        okFiles.map(async (file) => {
          const { base64 } = await fileToDataAndBase64(file);
          return {
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            base64,
          };
        })
      );
      setAttachedDocs((prev) => [...prev, ...newDocs]);
    }
  };

  const handleFilesSelected = async (e) => {
    await addFiles(Array.from(e.target.files || []));
    e.target.value = ""; // allow re-selecting the same file later
  };

  // Lets the user paste a screenshot or copied image straight into the
  // textarea with Ctrl+V / Cmd+V. If the clipboard has no image, normal
  // text pasting is left untouched.
  const handlePaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return; // let text paste through normally

    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter(Boolean);
    await addFiles(files);
  };

  const handleRemoveImage = (id) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  };

  // CHANGED: remove a single attached document before sending.
  const handleRemoveDoc = (id) => {
    setAttachedDocs((prev) => prev.filter((doc) => doc.id !== id));
  };

  // Toggle whether a single message is sent as context on future
  // requests. Disabled/forced-on in the UI while contextMode === "auto"
  // (see message.jsx) -- this handler simply isn't reachable then.
  const handleToggleIncluded = (id) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === id ? { ...msg, included: !msg.included } : msg
      )
    );
  };

  const handleToggleAllIncluded = () => {
    const nextValue = !allIncluded;
    setMessages((prev) =>
      prev.map((msg) => ({ ...msg, included: nextValue }))
    );
  };

  // Edits made in a message's code block (inline or in the docked panel)
  // permanently overwrite that message's stored text (and therefore
  // localStorage), so the next time this message is sent as context, the
  // edited code goes to Ollama instead of the original reply.
  const handleCodeEdit = (messageId, blockIndex, newCode) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              text: rebuildTextWithEditedCode(msg.text, blockIndex, newCode),
            }
          : msg
      )
    );

    onCodeBlockEdited?.({ source: "message", messageId, blockIndex, code: newCode });
  };

  // Clicking a long code block's preview card notifies the parent, which
  // owns the docked CodePanel's open/closed state and what's loaded in
  // it.
  const handleOpenCodePanel = (block) =>
    onOpenCodeBlock?.({ source: "message", ...block });

  // Exposed to the parent via ref: when a message's code block is open
  // and edited directly inside the standalone CodePanel (rather than the
  // inline mini-editor here in chat), the parent has no direct access to
  // this component's setMessages/rebuildTextWithEditedCode -- this is
  // the one imperative escape hatch that lets it trigger the same
  // rewrite handleCodeEdit already does for inline edits.
  useImperativeHandle(ref, () => ({
    applyCodeEdit: handleCodeEdit,
  }));

  const formatTime = () =>
    new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

  const openLightbox = (src) => setLightboxSrc(src);
  const closeLightbox = () => setLightboxSrc(null);

  // Resets the *current* chat back to just the greeting (keeps its id
  // and title intact) -- distinct from deleting a chat entirely, which
  // is done from the trash icon in ChatSwitcher instead.
  const handleClearChat = () => {
    if (!window.confirm("Clear this conversation? This can't be undone.")) return;
    setMessages([DEFAULT_GREETING]);
    onClearChat?.();
  };

  const handleNewChat = (name) => {
    const trimmed = name?.trim();
    const title = trimmed || "New chat";
    // If the user explicitly typed a name in the "New chat" dialog, treat
    // it like a manual rename (never auto-overwritten by title
    // derivation from the first message). Left blank, it behaves as
    // before: starts as "New chat" and adopts a derived title once the
    // first message is sent.
    const id = createChat(title, { isManualTitle: Boolean(trimmed) });
    saveChatMessages(id, [DEFAULT_GREETING]);
    setChats(listChats());
    switchToChat(id);
  };

  const handleSelectChat = (id) => {
    if (id === activeChatId) return;
    switchToChat(id);
  };

  const handleRenameChat = (id, title) => {
    renameChat(id, title);
    setChats(listChats());
  };

  const handleDeleteChat = (id) => {
    const wasActive = id === activeChatId;
    deleteChat(id);

    let remaining = listChats();
    if (remaining.length === 0) {
      // Never leave the user with zero chats to switch to.
      const newId = createChat("New chat");
      saveChatMessages(newId, [DEFAULT_GREETING]);
      remaining = listChats();
    }
    setChats(remaining);

    if (wasActive) {
      switchToChat(remaining[0].id);
    }
  };

  /*
   * Turns the set of messages that should count as context into the
   * exact array Ollama's /api/chat endpoint accepts for `messages`:
   *
   *   [
   *     { "role": "user", "content": "What is in this image?", "images": ["<base64>", ...] },
   *     { "role": "assistant", "content": "It looks like..." }
   *   ]
   *
   * Only "user" and "assistant" roles are ever produced here (Ollama also
   * accepts "system", but nothing in this UI creates system messages
   * today). `images` is included only when the message actually has
   * attachments, since Ollama treats a present-but-empty images array
   * differently from an absent one on some models.
   *
   * NOTE: attached *documents* are deliberately NOT part of this array.
   * They travel in the separate top-level `documents` field of the
   * payload (see handleSend), and the backend merges their extracted
   * text into the latest user message itself.
   *
   * Callers are expected to have already filtered the full message list
   * down to just what should be sent -- this function doesn't do any
   * filtering of its own.
   */
  const buildOllamaMessages = (allMessages) => {
    return allMessages.map((msg) => {
      const entry = {
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.text ?? "",
      };
      if (msg.images && msg.images.length > 0) {
        entry.images = msg.images;
      }
      return entry;
    });
  };

  const handleSend = async () => {
    const text = draft.trim();

    // CHANGED: a message with only documents attached is now sendable too.
    if (
      (!text && attachedImages.length === 0 && attachedDocs.length === 0) ||
      isBusy
    ) {
      return;
    }

    // CHANGED: copy the base64 payloads for the backend NOW, before
    // attachedDocs is cleared below. If the user sends only a file with
    // no text, give the model a default instruction.
    const docsPayload = attachedDocs.map(({ name, base64 }) => ({
      name,
      base64,
    }));
    const messageText =
      text || (attachedDocs.length > 0 ? "Please read the attached document(s) and summarize them." : "");

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: messageText,
      time: formatTime(),
      createdAt: new Date().toISOString(),
      // Local data: URI previews for rendering in the UI...
      imagePreviews: attachedImages.map((img) => img.previewUrl),
      // ...and the raw base64 payloads for Ollama's `images` field.
      images: attachedImages.map((img) => img.base64),
      // CHANGED: only name + size are stored on the message (for showing
      // the attachment chip in chat). The base64 is NOT stored here,
      // because the whole messages array is saved to localStorage and a
      // few documents would blow past its ~5 MB quota.
      documents: attachedDocs.map(({ id, name, size }) => ({ id, name, size })),
      // New messages are included by default; the user can uncheck them
      // afterwards to exclude them from later requests (manual context
      // mode only -- see contextMode below).
      included: true,
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setDraft("");
    setAttachedImages([]);
    setAttachedDocs([]); // CHANGED

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    setIsThinking(true);

    try {
      // Manual mode: only the messages the user has explicitly checked
      // (via the per-message checkboxes in message.jsx / "Send all as
      // context" in the bar above the composer) go over the wire.
      // Auto mode: there's no backend retrieval step anymore to pick
      // "relevant" messages for you, so it simply means the whole
      // conversation goes every time -- the per-message checkboxes are
      // disabled and treated as always-on (see message.jsx).
      const contextMessages = isAutoContext
        ? updatedMessages
        : updatedMessages.filter((msg) => msg.included);

      const payload = {
        model: selectedModel,
        messages: buildOllamaMessages(contextMessages),
        stream: false,
        options: { num_predict: maxTokens },
        // CHANGED: backend (conversation.py) reads exactly this key.
        documents: docsPayload,
      };

      // Log without the heavy base64 blobs so the console stays readable.
      console.log("Sending to backend:", {
        ...payload,
        messages: payload.messages.map((m) => ({
          ...m,
          images: m.images ? `[${m.images.length} image(s)]` : undefined,
        })),
        documents: docsPayload.map((d) => ({ name: d.name, base64: "..." })),
      });

      const response = await fetch(chat_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // CHANGED: show the backend's own error text (FastAPI puts it in
        // `detail`), e.g. "report.pdf exceeds the 5 MB file-size limit."
        let detail = "";
        try {
          const errBody = await response.json();
          detail = errBody?.detail ? ` — ${errBody.detail}` : "";
        } catch {
          // response had no JSON body; fall through with no detail
        }
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}${detail}`
        );
      }

      const data = await response.json();

      console.log("Backend response:", data);

      // Response shape: { message: { role, content }, ... }
      const assistantText = data.message?.content;

      if (!assistantText) {
        throw new Error("Response did not contain 'message.content'");
      }

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: assistantText,
        time: formatTime(),
        createdAt: new Date().toISOString(),
        included: true,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat API error:", error);

      const errorMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: `Sorry, I couldn't get a reply.\n\n\`${error.message}\``,
        time: formatTime(),
        createdAt: new Date().toISOString(),
        included: true,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setDraft(e.target.value);

    const el = e.target;

    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className={`chat-screen ${theme === "dark" ? "chat-theme-dark" : ""}`}>
      <Header
        assistantName={assistant.name}
        assistantSubtitle={assistantSubtitle}
        isBusy={isBusy}
        isThinking={isThinking}
        editorType={editorType}
        onToggleEditorType={onToggleEditorType}
        isCodePanelOpen={isCodePanelOpen}
        onToggleCodePanel={onToggleCodePanel}
        theme={theme}
        onToggleTheme={onToggleTheme}
        contextMode={contextMode}
        onToggleContextMode={onToggleContextMode}
        onClearChat={handleClearChat}
      />

      <div className="chat-switcher-bar">
        <ChatSwitcher
          chats={chats}
          activeChatId={activeChatId}
          onSelect={handleSelectChat}
          onNew={handleNewChat}
          onRename={handleRenameChat}
          onDelete={handleDeleteChat}
        />
      </div>

      <div className="chat-context-bar">
        {isAutoContext ? (
          <span className="chat-context-label chat-context-label-auto">
            Auto context — the entire conversation is sent every time
          </span>
        ) : (
          <label className="chat-context-label">
            <input
              type="checkbox"
              checked={allIncluded}
              ref={(el) => {
                if (el) el.indeterminate = !allIncluded && !noneIncluded;
              }}
              onChange={handleToggleAllIncluded}
            />
            Send all as context
          </label>
        )}

        <span className="chat-context-count">
          {isAutoContext
            ? `${messages.length} of ${messages.length} messages included`
            : `${includedCount} of ${messages.length} messages included`}
        </span>
      </div>

      <div className="chat-column">
        <ChatMessages
          messages={messages}
          userId={user.id}
          isThinking={isThinking}
          editorType={editorType}
          contextMode={contextMode}
          onToggleIncluded={handleToggleIncluded}
          onCodeChange={handleCodeEdit}
          onOpenPanel={handleOpenCodePanel}
          onOpenLightbox={openLightbox}
          scrollRef={scrollRef}
        />

        <InputBox
          draft={draft}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          textareaRef={textareaRef}
          attachedImages={attachedImages}
          attachedDocs={attachedDocs}
          onAttachClick={handleAttachClick}
          onRemoveImage={handleRemoveImage}
          onRemoveDoc={handleRemoveDoc}
          onOpenLightbox={openLightbox}
          fileInputRef={fileInputRef}
          onFilesSelected={handleFilesSelected}
          models={models}
          selectedModel={selectedModel}
          isLoadingModels={isLoadingModels}
          isModelMenuOpen={isModelMenuOpen}
          onToggleModelMenu={() => setIsModelMenuOpen((open) => !open)}
          onSelectModel={handleModelSelect}
          modelDescriptions={MODEL_DESCRIPTIONS}
          modelMenuRef={modelMenuRef}
          maxTokens={maxTokens}
          minTokens={MIN_TOKENS}
          maxTokensLimit={MAX_TOKENS}
          onMaxTokensChange={setMaxTokens}
          isBusy={isBusy}
          onSend={handleSend}
        />
      </div>

      {lightboxSrc && (
        <div className="chat-lightbox" onClick={closeLightbox}>
          <img src={lightboxSrc} alt="Full size" />
          <button
            className="chat-lightbox-close"
            onClick={closeLightbox}
            aria-label="Close preview"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
});

export default ChatPanel;