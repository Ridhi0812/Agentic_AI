import "./input_box.css";

const ACCEPT_TYPES = [
  "image/*",
  ".pdf",
  ".docx",
  ".xlsx",
  ".xls",
  ".csv",
  ".txt",
  ".md",
  ".json",
  ".py",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".html",
  ".css",
  ".xml",
  ".yaml",
  ".yml",
  ".ini",
  ".log",
].join(",");

const getDocIcon = (name = "") => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "📕";
  if (/\.(xlsx?|csv)$/.test(lower)) return "📊";
  if (/\.docx?$/.test(lower)) return "📘";
  return "📄";
};

const formatSize = (size) => {
  if (typeof size !== "number") return "";
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export default function InputBox({
  draft,
  onInput,
  onKeyDown,
  onPaste,
  textareaRef,

  attachedImages = [],
  attachedDocs = [],
  onAttachClick,
  onRemoveImage,
  onRemoveDoc,
  onOpenLightbox,
  fileInputRef,
  onFilesSelected,

  models,
  selectedModel,
  isLoadingModels,
  isModelMenuOpen,
  onToggleModelMenu,
  onSelectModel,
  modelDescriptions,
  modelMenuRef,

  maxTokens,
  minTokens,
  maxTokensLimit,
  onMaxTokensChange,

  isBusy,
  onSend,
}) {
  const hasAttachments =
    attachedImages.length > 0 || attachedDocs.length > 0;

  return (
    <div className="chat-input-area">
    
      {hasAttachments && (
        <div className="chat-attach-preview-row">
          
          {attachedImages.map((img) => (
            <div className="chat-attach-preview" key={img.id}>
              <img
                src={img.previewUrl}
                alt={img.file?.name || "Attached image"}
                onClick={() =>
                  img.previewUrl && onOpenLightbox(img.previewUrl)
                }
              />

              <button
                type="button"
                className="chat-attach-remove"
                onClick={() => onRemoveImage(img.id)}
                disabled={isBusy}
                aria-label={`Remove ${img.file?.name || "image"}`}
                title="Remove attachment"
              >
                ×
              </button>
            </div>
          ))}

        
          {attachedDocs.map((doc) => (
            <div className="chat-attach-preview" key={doc.id}>
              <div className="chat-file-preview">
                <span className="chat-file-icon">
                  {getDocIcon(doc.name)}
                </span>

                <span className="chat-file-name" title={doc.name}>
                  {doc.name}
                </span>

                {typeof doc.size === "number" && (
                  <span className="chat-file-size">
                    {formatSize(doc.size)}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="chat-attach-remove"
                onClick={() => onRemoveDoc(doc.id)}
                disabled={isBusy}
                aria-label={`Remove ${doc.name}`}
                title="Remove attachment"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-composer">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_TYPES}
          multiple
          hidden
          onChange={onFilesSelected}
        />

        <textarea
          ref={textareaRef}
          className="chat-composer-textarea"
          placeholder="Message the assistant..."
          rows={1}
          value={draft}
          onChange={onInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />

        <div className="chat-composer-controls">
          <div className="chat-composer-controls-left">
            <button
              type="button"
              className="chat-attach-btn"
              onClick={onAttachClick}
              disabled={isBusy}
              aria-label="Attach images or documents"
              title="Attach images or documents"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                width="16"
                height="16"
              >
                <path
                  d="M17 8.5l-7.4 7.4a3 3 0 104.2 4.2L21 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M17 8.5a3 3 0 10-4.2-4.2L6 10.9a5 5 0 007.1 7.1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div className="chat-model-picker" ref={modelMenuRef}>
              <button
                type="button"
                className="chat-model-trigger"
                onClick={onToggleModelMenu}
                disabled={
                  isLoadingModels || isBusy || models.length === 0
                }
                aria-haspopup="listbox"
                aria-expanded={isModelMenuOpen}
              >
                <span className="chat-model-trigger-label">
                  {isLoadingModels
                    ? "Loading models…"
                    : models.length === 0
                    ? "No models available"
                    : selectedModel}
                </span>

                <svg
                  className={`chat-model-chevron ${
                    isModelMenuOpen ? "chat-model-chevron-open" : ""
                  }`}
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {isModelMenuOpen && models.length > 0 && (
                <ul className="chat-model-menu" role="listbox">
                  {models.map((model) => (
                    <li
                      key={model}
                      role="option"
                      aria-selected={model === selectedModel}
                    >
                      <button
                        type="button"
                        className={`chat-model-option ${
                          model === selectedModel
                            ? "chat-model-option-selected"
                            : ""
                        }`}
                        onClick={() => onSelectModel(model)}
                      >
                        <span className="chat-model-option-text">
                          <span className="chat-model-option-name">
                            {model}
                          </span>

                          {modelDescriptions[model] && (
                            <span className="chat-model-option-desc">
                              {modelDescriptions[model]}
                            </span>
                          )}
                        </span>

                        {model === selectedModel && (
                          <svg
                            className="chat-model-check"
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                          >
                            <path
                              d="M5 13l4 4L19 7"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="chat-token-slider-wrap">
              <label htmlFor="chat-max-tokens">{maxTokens}</label>

              <input
                id="chat-max-tokens"
                type="range"
                className="chat-token-slider"
                min={minTokens}
                max={maxTokensLimit}
                step={64}
                value={maxTokens}
                onChange={(event) =>
                  onMaxTokensChange(Number(event.target.value))
                }
                disabled={isBusy}
                aria-label={`Max tokens: ${maxTokens}`}
                title={`Max tokens: ${maxTokens}`}
              />
            </div>
          </div>

          
          <button
            type="button"
            className="chat-send-btn"
            onClick={onSend}
            disabled={(!draft.trim() && !hasAttachments) || isBusy}
            aria-label="Send message"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              width="16"
              height="16"
            >
              <path
                d="M4 12L20 4L14 20L11 13L4 12Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <p className="chat-disclaimer">
        AI can make mistakes. Check important info.
      </p>
    </div>
  );
}
