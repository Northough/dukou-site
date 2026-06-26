import { useRef, useState } from "react";
import { formatTime } from "../systems/time.js";

function truncateText(text, limit = 30) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

function getAvatarInitial(name, fallback = "机") {
  return String(name || "").trim().slice(0, 1) || fallback;
}

function getAvatarClassName(role) {
  return `du-avatar is-${role}`;
}

function AvatarContent({ image, name, opacity = 1 }) {
  if (image) {
    return <img src={image} alt="" style={{ opacity }} />;
  }

  return getAvatarInitial(name);
}

function Avatar({ image = "", name = "机", opacity = 1, role = "assistant", size = 30 }) {
  return (
    <div className={getAvatarClassName(role)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      <AvatarContent image={image} name={name} opacity={opacity} />
    </div>
  );
}

function getQuote(message) {
  return message.quote || message.meta?.quote || null;
}

function getQuoteAuthorLabel(quote, displayNames) {
  if (quote?.role === "assistant") return displayNames.assistant;
  if (quote?.role === "user") return displayNames.user;
  if (quote?.authorName === "机") return displayNames.assistant;
  if (quote?.authorName === "我") return displayNames.user;
  return quote?.authorName || displayNames.user;
}

function canShowReasoning(message, isUser) {
  if (isUser || !message.reasoningContent) return false;
  if (message.reasoningSource !== "mock_reasoning_preview") return true;
  return typeof window !== "undefined" && window.localStorage.getItem("dukou:debugMockReasoning") === "true";
}

export default function Bubble({
  message,
  showAvatar = true,
  highlighted = false,
  selectable = false,
  selected = false,
  messageRef,
  onQuote,
  onJumpToQuote,
  onToggleReasoning,
  onSelect,
  onLongPress,
  onBlockedMessageAction,
  readOnly = false,
  displayNames = { assistant: "机", user: "我" },
  avatarImages = { assistant: "", user: "" },
  avatarOpacities = { assistant: 1, user: 1 },
  moreActions = [],
}) {
  const isUser = message.role === "user";
  const isCommandCompleted = message.type === "command_completed" || message.meta?.type === "command_completed";
  const isCommandCanceled = message.type === "command_canceled" || message.meta?.type === "command_canceled";
  const quote = getQuote(message);
  const avatarName = isUser ? displayNames.user : displayNames.assistant;
  const avatarImage = isUser ? avatarImages.user : avatarImages.assistant;
  const avatarOpacity = isUser ? avatarOpacities.user : avatarOpacities.assistant;
  const avatarRole = isUser ? "user" : "assistant";
  const quoteAuthorLabel = quote ? getQuoteAuthorLabel(quote, displayNames) : "";
  const messageSource = message.meta?.source || "";
  const isBlockedFailed = isUser && message.status === "blocked_failed";
  const isBlockedNote =
    message.status === "blocked_note" || messageSource === "blocked_note" || messageSource === "blocked_note_reply";
  const blockedNoteSignature = message.meta?.senderName || (isUser ? displayNames.user : displayNames.assistant);
  const blockedNoteLength = isBlockedNote ? Array.from(String(message.content || "")).length : 0;
  const blockedNoteDensityClass = blockedNoteLength > 22 ? " is-note-compact" : blockedNoteLength > 12 ? " is-note-medium" : "";
  const reasoningContent = canShowReasoning(message, isUser) ? String(message.reasoningContent || "") : "";
  const hasMoreActions = !readOnly && !selectable && moreActions.length > 0;
  const [moreOpen, setMoreOpen] = useState(false);
  const longPressTimerRef = useRef(null);

  if (isCommandCanceled) {
    return (
      <div
        ref={messageRef}
        className={"bubble-row is-user is-command-completed" + (highlighted ? " is-highlighted" : "")}
      >
        <div className="bubble-avatar-spacer" />
        <div className="bubble-stack">
          <div className="command-completed-pill is-canceled" title={message.meta?.title || ""}>
            <span aria-hidden="true">{"\u00d7"}</span>
            <strong>{"\u5df2\u53d6\u6d88"}</strong>
          </div>
        </div>
      </div>
    );
  }

  if (isCommandCompleted) {
    return (
      <div
        ref={messageRef}
        className={"bubble-row is-user is-command-completed" + (highlighted ? " is-highlighted" : "")}
      >
        <div className="bubble-avatar-spacer" />
        <div className="bubble-stack">
          <div className="command-completed-pill" title={message.meta?.title || ""}>
            <span aria-hidden="true">✓</span>
            <strong>已完成</strong>
          </div>
        </div>
      </div>
    );
  }

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    if (readOnly) return;
    if (selectable || !message.content) return;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      onLongPress?.();
    }, 560);
  };

  const selectFromKeyboard = (event) => {
    if (!selectable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.();
    }
  };

  const closeMoreMenuOnBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setMoreOpen(false);
    }
  };

  const handleMoreAction = (action) => {
    if (action.disabled) return;
    setMoreOpen(false);
    action.onSelect?.();
  };

  return (
    <div
      ref={messageRef}
      className={
        (isUser ? "bubble-row is-user" : "bubble-row") +
        (isBlockedFailed ? " is-blocked-failed" : "") +
        (isBlockedNote ? " is-blocked-note" : "") +
        (highlighted ? " is-highlighted" : "") +
        (selected ? " is-selected" : "")
      }
    >
      {showAvatar ? (
        <Avatar image={avatarImage} name={avatarName} opacity={avatarOpacity} role={avatarRole} />
      ) : (
        <div className="bubble-avatar-spacer" />
      )}
      <div className="bubble-stack">
        {selectable && (
          <button
            className={`bubble-select${selected ? " is-selected" : ""}`}
            type="button"
            onClick={onSelect}
            aria-label={selected ? "取消选择这条消息" : "选择这条消息"}
          >
            <span />
          </button>
        )}
        {reasoningContent && (
          <div className="reasoning-panel">
            <button type="button" onClick={readOnly ? undefined : onToggleReasoning} disabled={readOnly}>
              <span>机在想</span>
              <span>{message.reasoningVisible ? "收起" : "展开"}</span>
            </button>
            {message.reasoningVisible && <div className="reasoning-body">{reasoningContent}</div>}
          </div>
        )}
        <div className="bubble-send-line">
          {isBlockedFailed && (
            <button
              className="bubble-failed-button"
              type="button"
              onClick={() => onBlockedMessageAction?.(message)}
              aria-label="写小纸条"
            >
              !
            </button>
          )}
          <div
            className={"bubble" + (isBlockedNote ? " is-blocked-note" + blockedNoteDensityClass : "")}
            onPointerDown={readOnly ? undefined : startLongPress}
            onPointerUp={readOnly ? undefined : clearLongPress}
            onPointerLeave={readOnly ? undefined : clearLongPress}
            onPointerCancel={readOnly ? undefined : clearLongPress}
            onClick={!readOnly && selectable ? onSelect : undefined}
            onKeyDown={readOnly ? undefined : selectFromKeyboard}
            role={!readOnly && selectable ? "button" : undefined}
            tabIndex={!readOnly && selectable ? 0 : undefined}
          >
            {quote &&
              !isBlockedNote &&
              (readOnly ? (
                <div className="bubble-quote is-static">
                  <span>{quoteAuthorLabel}</span>
                  <strong>{truncateText(quote.content || quote.title || quote.body)}</strong>
                </div>
              ) : (
                <button className="bubble-quote" type="button" onClick={() => onJumpToQuote?.(quote.id)}>
                  <span>{quoteAuthorLabel}</span>
                  <strong>{truncateText(quote.content || quote.title || quote.body)}</strong>
                </button>
              ))}
            {isBlockedNote ? (
              <>
                <span className="blocked-note-content">{message.content}</span>
                <span className="blocked-note-signature">——{blockedNoteSignature}</span>
              </>
            ) : (
              <span className="bubble-content">{message.content}</span>
            )}
          </div>
        </div>
        <div className="bubble-meta">
          <span>{formatTime(message.created_at)}</span>
          {isBlockedFailed && <span className="is-failed">未送达</span>}
          {isBlockedNote && <span>小纸条</span>}
          {isUser && !isBlockedFailed && !isBlockedNote && (
            <span className={message.read_by_du ? "is-read" : ""}>{message.read_by_du ? "已读" : "已送达"}</span>
          )}
          {!readOnly && !selectable && message.content && !isBlockedFailed && !isBlockedNote && (
            <button className="bubble-action" type="button" onClick={onQuote}>
              引用
            </button>
          )}
          {hasMoreActions && (
            <div className="bubble-more" onBlur={closeMoreMenuOnBlur}>
              <button
                className="bubble-more-button"
                type="button"
                onClick={() => setMoreOpen((value) => !value)}
                aria-label="更多消息操作"
                aria-expanded={moreOpen}
              >
                ...
              </button>
              {moreOpen && (
                <div className="bubble-more-menu" role="menu">
                  {moreActions.map((action) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={action.id}
                      onClick={() => handleMoreAction(action)}
                      disabled={action.disabled}
                    >
                      <span className="bubble-more-icon">{action.icon}</span>
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
