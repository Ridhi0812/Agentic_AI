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

const DOC_EXTENSIONS = [
  ".pdf", ".docx", ".xlsx", ".xls", ".csv", ".txt", ".md", ".json",
  ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".xml",
  ".yaml", ".yml", ".ini", ".log",
];
const MAX_DOC_BYTES = 5 * 1024 * 1024; 
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

  const loadedChatIdRef = useRef(activeChatId);

  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const [attachedImages, setAttachedImages] = useState([]);

  const [attachedDocs, setAttachedDocs] = useState([]);

  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  const [maxTokens, setMaxTokens] = useState(1024);
  const MIN_TOKENS = 64;
  const MAX_TOKENS = 4096;

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

  const switchToChat = (id) => {
    persistActiveChatId(id);
    loadedChatIdRef.current = id;
    setMessages(loadChatMessages(id) ?? [DEFAULT_GREETING]);
    setDraft("");
    setAttachedImages([]);
    setAttachedDocs([]); 
    setIsThinking(false);
    setActiveChatId(id);
  };

  useEffect(() => {
    if (loadedChatIdRef.current !== activeChatId) return;
    saveChatMessages(activeChatId, messages);
    setChats(listChats());
  }, [activeChatId, messages]);

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
        const list = rawList
          .map((m) => (typeof m === "string" ? m : m.name ?? m.model))
          .filter(Boolean);
        setModels(list);

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

  const MODEL_DESCRIPTIONS = {
    "llama3.1": "Meta's general-purpose model",
    "llama3": "Meta's general-purpose model",
    "mistral": "Fast, lightweight, solid all-rounder",
    "codellama": "Tuned for code",
    "llava": "Vision + language (image understanding)",
    "gemma2": "Google's open-weight model",
    "qwen2.5": "Strong at reasoning and code",
  };

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
    e.target.value = ""; 
  };

  const handlePaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return; 

    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter(Boolean);
    await addFiles(files);
  };

  const handleRemoveImage = (id) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleRemoveDoc = (id) => {
    setAttachedDocs((prev) => prev.filter((doc) => doc.id !== id));
  };

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

  const handleOpenCodePanel = (block) =>
    onOpenCodeBlock?.({ source: "message", ...block });

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

  const handleClearChat = () => {
    if (!window.confirm("Clear this conversation? This can't be undone.")) return;
    setMessages([DEFAULT_GREETING]);
    onClearChat?.();
  };

  const handleNewChat = (name) => {
    const trimmed = name?.trim();
    const title = trimmed || "New chat";
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

    if (
      (!text && attachedImages.length === 0 && attachedDocs.length === 0) ||
      isBusy
    ) {
      return;
    }

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
      imagePreviews: attachedImages.map((img) => img.previewUrl),
      images: attachedImages.map((img) => img.base64),
      documents: attachedDocs.map(({ id, name, size }) => ({ id, name, size })),
      included: true,
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setDraft("");
    setAttachedImages([]);
    setAttachedDocs([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    setIsThinking(true);

    try {
      const contextMessages = isAutoContext
        ? updatedMessages
        : updatedMessages.filter((msg) => msg.included);

      const payload = {
        model: selectedModel,
        messages: buildOllamaMessages(contextMessages),
        stream: false,
        options: { num_predict: maxTokens },
        documents: docsPayload,
      };
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
        let detail = "";
        try {
          const errBody = await response.json();
          detail = errBody?.detail ? ` — ${errBody.detail}` : "";
        } catch {
        }
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}${detail}`
        );
      }

      const data = await response.json();

      console.log("Backend response:", data);

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
