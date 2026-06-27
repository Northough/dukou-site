import { useEffect, useMemo, useRef, useState } from "react";
import MessageInput from "../components/MessageInput.jsx";
import {
  clearMockGroupMessages,
  fetchGroupRoster,
  pollGroupMessages,
  sendGroupMessage,
} from "../api/groupTransport.js";

const POLL_INTERVAL_MS = 2200;
const COLOR_CLASS = {
  orange: "is-orange",
  blue: "is-blue",
  green: "is-green",
  purple: "is-purple",
  slate: "is-slate",
  neutral: "is-neutral",
};

function formatTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function memberTitle(member) {
  return member?.display_name || member?.id || "unknown";
}

function normalizeRoster(roster) {
  return Array.isArray(roster) ? roster : [];
}

function memberColorClass(member) {
  return COLOR_CLASS[member?.color] || "is-neutral";
}

function isHuman(member) {
  return member?.kind === "human" || member?.can_reply === false;
}

function buildMentionPrefix(member) {
  if (!member || isHuman(member)) return "";
  return `@${member.id} `;
}

function GroupMessage({ message, member, isOwn }) {
  return (
    <div className={`group-message-row${isOwn ? " is-own" : ""}`}>
      {!isOwn && (
        <div className={`group-avatar ${memberColorClass(member)}`}>
          <span>{member?.avatar || memberTitle(member).slice(0, 1)}</span>
        </div>
      )}
      <div className="group-message-stack">
        <div className="group-message-meta">
          <strong>{isOwn ? "17" : memberTitle(member)}</strong>
          {member?.model && <span>{member.model}</span>}
          <time>{formatTime(message.ts)}</time>
        </div>
        <div className="group-message-bubble">
          <span>{message.text}</span>
        </div>
      </div>
      {isOwn && <div className="group-avatar is-neutral"><span>17</span></div>}
    </div>
  );
}

export default function GroupChat({ onOpenSettings }) {
  const [roster, setRoster] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeMemberId, setActiveMemberId] = useState("all");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastTsRef = useRef("");
  const listRef = useRef(null);

  const membersById = useMemo(() => {
    return Object.fromEntries(roster.map((member) => [member.id, member]));
  }, [roster]);

  const replyMembers = useMemo(() => roster.filter((member) => member.can_reply), [roster]);
  const activeMember = activeMemberId === "all" ? null : membersById[activeMemberId];

  const visibleMessages = useMemo(() => {
    if (activeMemberId === "all") return messages;
    return messages.filter((message) => {
      if (message.sender_id === activeMemberId) return true;
      if (message.sender_id === "user" && Array.isArray(message.mentions)) {
        return message.mentions.includes(activeMemberId) || message.mentions.includes("__all__");
      }
      return false;
    });
  }, [activeMemberId, messages]);

  useEffect(() => {
    let closed = false;
    let timer = null;

    async function loadInitial() {
      try {
        setLoading(true);
        const rosterPayload = await fetchGroupRoster();
        if (closed) return;
        setRoster(normalizeRoster(rosterPayload.roster));
        const pollPayload = await pollGroupMessages({ limit: 80 });
        if (closed) return;
        setMessages(pollPayload.records || []);
        lastTsRef.current = pollPayload.last_ts || pollPayload.records?.at(-1)?.ts || "";
        setError("");
      } catch (err) {
        if (!closed) setError(err?.message || "群聊加载失败");
      } finally {
        if (!closed) setLoading(false);
      }
    }

    async function poll() {
      try {
        const payload = await pollGroupMessages({ since: lastTsRef.current, limit: 80 });
        if (closed) return;
        if (payload.records?.length) {
          setMessages((current) => {
            const seen = new Set(current.map((message) => message.id));
            return [...current, ...payload.records.filter((message) => !seen.has(message.id))];
          });
          lastTsRef.current = payload.last_ts || payload.records.at(-1)?.ts || lastTsRef.current;
        }
        setError("");
      } catch (err) {
        if (!closed) setError(err?.message || "群聊轮询失败");
      } finally {
        if (!closed) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    loadInitial().then(() => {
      if (!closed) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    });

    const onStorageChange = () => {
      pollGroupMessages({ limit: 80 }).then((payload) => {
        if (closed) return;
        setMessages(payload.records || []);
        lastTsRef.current = payload.last_ts || payload.records?.at(-1)?.ts || "";
      });
    };
    window.addEventListener("dukou:group-messages-changed", onStorageChange);

    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.removeEventListener("dukou:group-messages-changed", onStorageChange);
    };
  }, []);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [visibleMessages.length, activeMemberId]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    const prefix = buildMentionPrefix(activeMember);
    const finalText = prefix && !text.startsWith(prefix.trim()) ? `${prefix}${text}` : text;
    const mentions = activeMember ? [activeMember.id] : [];
    try {
      setSending(true);
      await sendGroupMessage({ text: finalText, mentions });
      setDraft("");
      const payload = await pollGroupMessages({ limit: 80 });
      setMessages(payload.records || []);
      lastTsRef.current = payload.last_ts || payload.records?.at(-1)?.ts || "";
      setError("");
    } catch (err) {
      setError(err?.message || "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function resetMock() {
    await clearMockGroupMessages();
    const payload = await pollGroupMessages({ limit: 80 });
    setMessages(payload.records || []);
    lastTsRef.current = payload.last_ts || payload.records?.at(-1)?.ts || "";
  }

  return (
    <section className="chat-root group-root">
      <header className="chat-header group-header">
        <button className="chat-icon-button" type="button" onClick={onOpenSettings} aria-label="打开设置">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3.5v2.2m0 12.6v2.2M4.6 7.8l1.9 1.1m11 6.2 1.9 1.1M4.6 16.2l1.9-1.1m11-6.2 1.9-1.1" />
          </svg>
        </button>
        <div className="chat-header-title">
          <div className="chat-header-title-row">
            <strong>{activeMember ? memberTitle(activeMember) : "群聊"}</strong>
          </div>
          <span>{activeMember ? `只看并发送给 ${memberTitle(activeMember)}` : "所有角色窗口"}</span>
        </div>
        <button className="chat-icon-button" type="button" onClick={resetMock} aria-label="重置群聊 mock">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 4v6h6" />
            <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          </svg>
        </button>
      </header>

      <div className="group-switcher" aria-label="角色窗口">
        <button
          type="button"
          className={activeMemberId === "all" ? "is-active" : ""}
          onClick={() => setActiveMemberId("all")}
        >
          <span className="group-switch-avatar is-neutral">群</span>
          <strong>群聊</strong>
        </button>
        {replyMembers.map((member) => (
          <button
            type="button"
            key={member.id}
            className={activeMemberId === member.id ? "is-active" : ""}
            onClick={() => setActiveMemberId(member.id)}
          >
            <span className={`group-switch-avatar ${memberColorClass(member)}`}>{member.avatar || memberTitle(member).slice(0, 1)}</span>
            <strong>{memberTitle(member)}</strong>
          </button>
        ))}
      </div>

      {error && <div className="group-status-banner">{error}</div>}

      <div className="message-list group-message-list" ref={listRef}>
        {loading ? (
          <div className="group-empty">正在载入群聊...</div>
        ) : visibleMessages.length ? (
          visibleMessages.map((message) => (
            <GroupMessage
              key={message.id}
              message={message}
              member={membersById[message.sender_id]}
              isOwn={message.sender_id === "user"}
            />
          ))
        ) : (
          <div className="group-empty">这个角色窗口还没有消息。</div>
        )}
      </div>

      <MessageInput
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        disabled={sending}
        disabledLabel="正在发送..."
        placeholder={activeMember ? `发给 ${memberTitle(activeMember)}` : "发到群聊，或 @角色"}
        displayNames={{ assistant: activeMember ? memberTitle(activeMember) : "群聊", user: "17" }}
      />
    </section>
  );
}
