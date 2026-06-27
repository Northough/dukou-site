const STORAGE_KEY = "dukou:groupMockState";
const REAL_SETTINGS_KEY = "dukou:groupTransportSettings";

const DEFAULT_ROSTER = [
  {
    id: "user",
    display_name: "17",
    kind: "human",
    avatar: "17",
    color: "neutral",
    model: "",
    tmux: null,
    can_reply: false,
  },
  {
    id: "nortia",
    display_name: "Nortia",
    kind: "agent",
    avatar: "N",
    color: "blue",
    model: "Default",
    tmux: "nortia",
    can_reply: true,
  },
  {
    id: "cenxu",
    display_name: "岑序",
    kind: "agent",
    avatar: "岑",
    color: "blue",
    model: "Codex",
    tmux: "cenxu",
    can_reply: true,
  },
  {
    id: "dukou",
    display_name: "渡口",
    kind: "agent",
    avatar: "渡",
    color: "orange",
    model: "Claude",
    tmux: "dukou",
    can_reply: true,
  },
];

const MENTION_ALIASES = {
  all: "__all__",
  "@all": "__all__",
  nortia: "nortia",
  Nortia: "nortia",
  cenxu: "cenxu",
  "岑序": "cenxu",
  dukou: "dukou",
  "渡口": "dukou",
};

function nowIso() {
  return new Date().toISOString();
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson(key, fallback) {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (canUseStorage()) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

function createMessage({
  sender_id,
  text,
  mentions = [],
  source = "dukou-site",
  message_type = "chat",
  parent_msg_id = null,
}) {
  const member = DEFAULT_ROSTER.find((item) => item.id === sender_id);
  return {
    id: `grp_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
    ts: nowIso(),
    conversation_id: "workgroup",
    sender_id,
    sender_model: member?.model || null,
    text: String(text || "").trim(),
    mentions,
    parent_msg_id,
    reply_to: parent_msg_id,
    source,
    message_type,
    task_id: null,
    parent_task_id: null,
    owner: null,
    attachment_url: null,
    attachment_filename: null,
    attachment_type: null,
  };
}

function seedState() {
  return {
    roster: DEFAULT_ROSTER,
    records: [
      createMessage({
        sender_id: "nortia",
        text: "群聊前端已进入 mock 模式。这里会对齐 CCC 的 /group/roster、/group/poll、/group/send。",
        mentions: ["user"],
        source: "mock",
      }),
      createMessage({
        sender_id: "cenxu",
        text: "群聊只是窗口，回复会显示各自角色的头像。",
        mentions: ["user"],
        source: "mock",
      }),
    ],
  };
}

function readState() {
  const state = readJson(STORAGE_KEY, null);
  if (state?.records && state?.roster) return state;
  const seeded = seedState();
  writeJson(STORAGE_KEY, seeded);
  return seeded;
}

function writeState(state) {
  writeJson(STORAGE_KEY, state);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("dukou:group-messages-changed"));
  }
}

function readRealSettings() {
  return readJson(REAL_SETTINGS_KEY, { mode: "mock", apiBaseUrl: "", token: "" });
}

function realHeaders(hasBody = false) {
  const { token } = readRealSettings();
  return {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "X-Auth-Token": token } : {}),
  };
}

async function realRequest(path, options = {}) {
  const { apiBaseUrl } = readRealSettings();
  if (!apiBaseUrl) throw new Error("Group API base URL is empty");
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
    ...options,
    headers: {
      ...realHeaders(Boolean(options.body)),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Group API ${response.status}`);
  return response.json();
}

function normalizeMentions(text, explicitMentions = []) {
  const items = Array.isArray(explicitMentions) ? explicitMentions : [];
  const fromText = Array.from(String(text || "").matchAll(/@([A-Za-z0-9_\-]+|[\u4e00-\u9fff]+)/g)).map((match) => match[1]);
  const ids = [...items, ...fromText]
    .map((item) => MENTION_ALIASES[String(item).trim().toLowerCase()] || MENTION_ALIASES[String(item).trim()] || item)
    .filter(Boolean);
  return [...new Set(ids)];
}

function replyTargets(mentions) {
  const replyable = DEFAULT_ROSTER.filter((member) => member.can_reply).map((member) => member.id);
  if (!mentions.length || mentions.includes("__all__")) return replyable;
  return mentions.filter((id) => replyable.includes(id));
}

function mockAgentReply(target, userText) {
  const member = DEFAULT_ROSTER.find((item) => item.id === target);
  return createMessage({
    sender_id: target,
    text: `${member?.display_name || target} 收到：${String(userText || "").replace(/^@\S+\s*/, "")}`,
    mentions: ["user"],
    source: "mock-agent",
  });
}

export function getGroupTransportSettings() {
  return readRealSettings();
}

export function setGroupTransportSettings(settings) {
  writeJson(REAL_SETTINGS_KEY, {
    mode: settings?.mode === "real" ? "real" : "mock",
    apiBaseUrl: String(settings?.apiBaseUrl || ""),
    token: String(settings?.token || ""),
  });
}

export async function fetchGroupRoster() {
  if (readRealSettings().mode === "real") {
    return realRequest("/group/roster");
  }
  const state = readState();
  return {
    ok: true,
    roster: state.roster,
    status: {
      agents: Object.fromEntries(
        state.roster
          .filter((member) => member.can_reply)
          .map((member) => [member.id, { state: "mock", tmux: member.tmux, is_typing: false }])
      ),
    },
  };
}

export async function pollGroupMessages({ since = "", limit = 100 } = {}) {
  if (readRealSettings().mode === "real") {
    const query = new URLSearchParams({ limit: String(limit), sender_id: "user" });
    if (since) query.set("since", since);
    return realRequest(`/group/poll?${query.toString()}`);
  }
  const state = readState();
  const records = since ? state.records.filter((record) => record.ts > since) : state.records.slice(-limit);
  return {
    ok: true,
    records: records.slice(0, limit),
    count: records.length,
    last_ts: records.at(-1)?.ts || since,
    status: { agents: {} },
  };
}

export async function sendGroupMessage({ text, mentions = [], senderId = "user", parentMsgId = null }) {
  if (readRealSettings().mode === "real") {
    return realRequest("/group/send", {
      method: "POST",
      body: JSON.stringify({
        sender_id: senderId,
        text,
        mentions,
        parent_msg_id: parentMsgId,
        reply_to: parentMsgId,
      }),
    });
  }
  const normalizedMentions = normalizeMentions(text, mentions);
  const state = readState();
  const userRecord = createMessage({
    sender_id: senderId,
    text,
    mentions: normalizedMentions,
    parent_msg_id: parentMsgId,
  });
  const replies = replyTargets(normalizedMentions).map((target) => mockAgentReply(target, text));
  const nextState = {
    ...state,
    records: [...state.records, userRecord, ...replies],
  };
  writeState(nextState);
  return { ok: true, record: userRecord, targets: replies.map((reply) => reply.sender_id) };
}

export async function clearMockGroupMessages() {
  const state = seedState();
  writeState(state);
  return state;
}
