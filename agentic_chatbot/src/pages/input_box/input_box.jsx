import "./input_box.css";

/**
 * Bottom composer: pending image attachments, the textarea, and the
 * controls row (attach, model picker, token slider, send). All state
 * (draft text, attachedImages, models, selectedModel, maxTokens, the
 * model popover open/closed) lives in the parent ChatPanel and is passed
 * down as props/refs -- this component is purely presentational plus
 * the outside-click-to-close wiring for its own model popover ref.
 */
export default function InputBox({
  draft,
  onInput,
  onKeyDown,
  onPaste,
  textareaRef,

  attachedImages,
  onAttachClick,
  onRemoveImage,
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
  return (
    <div className="chat-input-area">
      {attachedImages.length > 0 && (
        <div className="chat-attach-preview-row">
          {attachedImages.map((img) => (
            <div className="chat-attach-preview" key={img.id}>
              <img
                src={img.previewUrl}
                alt="Attachment preview"
                onClick={() => onOpenLightbox(img.previewUrl)}
              />
              <button
                type="button"
                className="chat-attach-remove"
                onClick={() => onRemoveImage(img.id)}
                aria-label="Remove image"
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
          accept="image/*"
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
              aria-label="Attach image"
            >
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
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
                disabled={isLoadingModels || isBusy || models.length === 0}
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
                  {models.map((m) => (
                    <li key={m} role="option" aria-selected={m === selectedModel}>
                      <button
                        type="button"
                        className={`chat-model-option ${
                          m === selectedModel ? "chat-model-option-selected" : ""
                        }`}
                        onClick={() => onSelectModel(m)}
                      >
                        <span className="chat-model-option-text">
                          <span className="chat-model-option-name">{m}</span>
                          {modelDescriptions[m] && (
                            <span className="chat-model-option-desc">
                              {modelDescriptions[m]}
                            </span>
                          )}
                        </span>
                        {m === selectedModel && (
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
                onChange={(e) => onMaxTokensChange(Number(e.target.value))}
                disabled={isBusy}
                aria-label={`Max tokens: ${maxTokens}`}
                title={`Max tokens: ${maxTokens}`}
              />
            </div>
          </div>

          <button
            className="chat-send-btn"
            onClick={onSend}
            disabled={(!draft.trim() && attachedImages.length === 0) || isBusy}
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
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