import { getLocalUserId, getSessionId } from "../store/session.js";

const DB_NAME = "dukou-message-archive";
const DB_VERSION = 1;
const MESSAGE_STORE = "messages";
export const DEFAULT_CONVERSATION_ID = "main";
const LEGACY_MESSAGES_KEY = "dukou:messages";
const APP_VERSION = "0.1.0";
const MAX_KEY = "\uffff";

let dbPromise = null;
let readyPromise = null;

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function makeMessageId() {
  const randomId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `message-${randomId}`;
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeQuote(quote) {
  if (!quote) return null;
  const role = quote.role === "assistant" ? "assistant" : "user";
  return {
    id: quote.id || quote.sourceId || "",
    role,
    authorName: role === "assistant" ? "机" : "我",
    content: String(quote.content || quote.title || quote.body || ""),
    createdAt: quote.createdAt || quote.created_at || undefined,
  };
}

function sanitizeMeta(meta = {}) {
  const bannedKeys = new Set([
    "apiKey",
    "authorization",
    "headers",
    "raw",
    "rawResponse",
    "response",
    "token",
    "secret",
    "password",
  ]);

  return Object.fromEntries(
    Object.entries(meta || {}).filter(([key]) => !bannedKeys.has(key) && !/authorization|api.?key|secret|token/i.test(key))
  );
}

export function normalizeArchivedMessage(record = {}) {
  const quote = normalizeQuote(record.quote || record.meta?.quote);
  const createdAt = normalizeDate(record.createdAt || record.created_at);
  const sessionId = record.sessionId || record.session_id || getSessionId();
  const conversationId = record.conversationId || record.chatSpaceId || record.meta?.chatSpaceId || DEFAULT_CONVERSATION_ID;
  const status = record.status || "sent";
  const excludedFromContext = Boolean(
    record.excludedFromContext ||
      record.meta?.excludedFromContext ||
      status === "deleted" ||
      status === "superseded"
  );
  const readByUser = Boolean(record.readByUser ?? record.read_by_user);
  const readByDu = Boolean(record.readByDu ?? record.read_by_du);
  const meta = {
    localUserId: getLocalUserId(),
    app: "dukou",
    ...sanitizeMeta(record.meta),
    chatSpaceId: record.chatSpaceId || record.meta?.chatSpaceId || conversationId,
    ...(excludedFromContext ? { excludedFromContext: true } : {}),
    ...(quote ? { quote } : {}),
  };

  return {
    id: record.id || makeMessageId(),
    type: record.type || record.meta?.type || "message",
    conversationId,
    chatSpaceId: record.chatSpaceId || record.meta?.chatSpaceId || conversationId,
    sessionId,
    session_id: sessionId,
    role: ["user", "assistant", "system"].includes(record.role) ? record.role : "user",
    content: String(record.content || ""),
    createdAt,
    created_at: createdAt,
    quote,
    reasoningContent: record.reasoningContent || record.meta?.reasoningContent || "",
    reasoningSource: record.reasoningSource || record.meta?.reasoningSource || undefined,
    reasoningVisible: typeof record.reasoningVisible === "boolean" ? record.reasoningVisible : false,
    readByUser,
    readByDu,
    read_by_user: readByUser,
    read_by_du: readByDu,
    status,
    excludedFromContext,
    deletedAt: record.deletedAt || record.meta?.deletedAt || undefined,
    supersededAt: record.supersededAt || record.meta?.supersededAt || undefined,
    responseGroupId: record.responseGroupId || record.meta?.responseGroupId || undefined,
    meta,
  };
}

function openArchiveDb() {
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error("IndexedDB 不可用"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(MESSAGE_STORE)
        ? request.transaction.objectStore(MESSAGE_STORE)
        : db.createObjectStore(MESSAGE_STORE, { keyPath: "id" });

      if (!store.indexNames.contains("conversationCreatedAt")) {
        store.createIndex("conversationCreatedAt", ["conversationId", "createdAt"]);
      }
      if (!store.indexNames.contains("conversationRoleCreatedAt")) {
        store.createIndex("conversationRoleCreatedAt", ["conversationId", "role", "createdAt"]);
      }
      if (!store.indexNames.contains("createdAt")) {
        store.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function emitArchiveChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("dukou:messages-changed"));
  }
}

async function migrateLegacyMessages(db) {
  if (typeof window === "undefined") return;

  const raw = window.localStorage.getItem(LEGACY_MESSAGES_KEY);
  if (!raw) return;

  try {
    const legacyMessages = JSON.parse(raw);
    if (Array.isArray(legacyMessages) && legacyMessages.length) {
      const transaction = db.transaction(MESSAGE_STORE, "readwrite");
      const store = transaction.objectStore(MESSAGE_STORE);
      legacyMessages.forEach((message) => {
        store.put(normalizeArchivedMessage(message));
      });
      await transactionDone(transaction);
    }
  } finally {
    window.localStorage.removeItem(LEGACY_MESSAGES_KEY);
  }
}

async function getReadyDb() {
  if (!readyPromise) {
    readyPromise = openArchiveDb().then(async (db) => {
      await migrateLegacyMessages(db);
      return db;
    });
  }
  return readyPromise;
}

async function collectFromCursor({ indexName = "conversationCreatedAt", range, direction = "next", limit = 30, filter }) {
  const db = await getReadyDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MESSAGE_STORE, "readonly");
    const index = transaction.objectStore(MESSAGE_STORE).index(indexName);
    const request = index.openCursor(range, direction);
    const items = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || items.length >= limit) {
        resolve(items);
        return;
      }

      const message = normalizeArchivedMessage(cursor.value);
      if (!filter || filter(message)) {
        items.push(message);
      }
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
}

function conversationRange({ conversationId = DEFAULT_CONVERSATION_ID, from = "", to = MAX_KEY, upperOpen = false } = {}) {
  return IDBKeyRange.bound([conversationId, from], [conversationId, to], false, upperOpen);
}

function roleRange(role, conversationId = DEFAULT_CONVERSATION_ID) {
  return IDBKeyRange.bound([conversationId, role, ""], [conversationId, role, MAX_KEY]);
}

function isVisibleMessage(message) {
  return !message.excludedFromContext && message.status !== "deleted" && message.status !== "superseded";
}

export async function saveMessage(message) {
  const db = await getReadyDb();
  const record = normalizeArchivedMessage(message);
  const transaction = db.transaction(MESSAGE_STORE, "readwrite");
  transaction.objectStore(MESSAGE_STORE).put(record);
  await transactionDone(transaction);
  emitArchiveChanged();
  return record;
}

export async function getLatestMessages(limit = 50, { conversationId = DEFAULT_CONVERSATION_ID, includeExcluded = false } = {}) {
  const messages = await collectFromCursor({
    range: conversationRange({ conversationId }),
    direction: "prev",
    limit,
    filter: includeExcluded ? undefined : isVisibleMessage,
  });
  return messages.reverse();
}

export async function getMessagesBefore({ beforeCreatedAt, limit = 30, conversationId = DEFAULT_CONVERSATION_ID, includeExcluded = false }) {
  if (!beforeCreatedAt) return [];
  const messages = await collectFromCursor({
    range: conversationRange({ conversationId, to: beforeCreatedAt, upperOpen: true }),
    direction: "prev",
    limit,
    filter: includeExcluded ? undefined : isVisibleMessage,
  });
  return messages.reverse();
}

export async function getMessagesAfter({ afterCreatedAt, limit = 30, conversationId = DEFAULT_CONVERSATION_ID, includeExcluded = false }) {
  if (!afterCreatedAt) return [];
  return collectFromCursor({
    range: IDBKeyRange.bound([conversationId, afterCreatedAt], [conversationId, MAX_KEY], true, false),
    direction: "next",
    limit,
    filter: includeExcluded ? undefined : isVisibleMessage,
  });
}

export async function getMessageContext({ messageId, before = 30, after = 30, includeExcluded = false }) {
  const db = await getReadyDb();
  const transaction = db.transaction(MESSAGE_STORE, "readonly");
  const target = await requestResult(transaction.objectStore(MESSAGE_STORE).get(messageId));
  if (!target) return { target: null, messages: [] };

  const message = normalizeArchivedMessage(target);
  if (!includeExcluded && !isVisibleMessage(message)) return { target: null, messages: [] };
  const [beforeMessages, afterMessages] = await Promise.all([
    getMessagesBefore({ beforeCreatedAt: message.createdAt, limit: before, conversationId: message.conversationId, includeExcluded }),
    getMessagesAfter({ afterCreatedAt: message.createdAt, limit: after, conversationId: message.conversationId, includeExcluded }),
  ]);

  return {
    target: message,
    messages: [...beforeMessages, message, ...afterMessages],
  };
}

function normalizeSearchDateStart(value) {
  if (!value) return "";
  return normalizeDate(`${value}T00:00:00`);
}

function normalizeSearchDateEnd(value) {
  if (!value) return MAX_KEY;
  return normalizeDate(`${value}T23:59:59.999`);
}

function matchesKeyword(message, keyword) {
  if (!keyword) return true;
  const haystack = [message.content, message.quote?.content, message.meta?.quote?.content].filter(Boolean).join("\n").toLowerCase();
  return haystack.includes(keyword.toLowerCase());
}

export async function searchMessages({ keyword = "", dateFrom = "", dateTo = "", role = "all", limit = 30, cursor = "" } = {}) {
  const normalizedRole = ["user", "assistant", "system"].includes(role) ? role : "all";
  const lower = normalizeSearchDateStart(dateFrom);
  const upper = cursor || normalizeSearchDateEnd(dateTo);
  if (lower && upper !== MAX_KEY && lower > upper) {
    return { items: [], nextCursor: "" };
  }
  const range = conversationRange({ from: lower, to: upper, upperOpen: Boolean(cursor) });
  const items = await collectFromCursor({
    range,
    direction: "prev",
    limit,
    filter: (message) =>
      (normalizedRole === "all" || message.role === normalizedRole) &&
      isVisibleMessage(message) &&
      (dateTo ? message.createdAt <= normalizeSearchDateEnd(dateTo) : true) &&
      matchesKeyword(message, keyword.trim()),
  });

  return {
    items,
    nextCursor: items.length >= limit ? items[items.length - 1]?.createdAt || "" : "",
  };
}

export async function patchMessage(id, patch) {
  const db = await getReadyDb();
  const transaction = db.transaction(MESSAGE_STORE, "readonly");
  const store = transaction.objectStore(MESSAGE_STORE);
  const existing = await requestResult(store.get(id));
  if (!existing) return null;

  return saveMessage({ ...existing, ...patch, id: existing.id });
}

export async function patchMessagesByRole(role, patch, { conversationId = DEFAULT_CONVERSATION_ID } = {}) {
  const db = await getReadyDb();
  const transaction = db.transaction(MESSAGE_STORE, "readwrite");
  const index = transaction.objectStore(MESSAGE_STORE).index("conversationRoleCreatedAt");
  const request = index.openCursor(roleRange(role, conversationId));

  await new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }

      const updateRequest = cursor.update(normalizeArchivedMessage({ ...cursor.value, ...patch }));
      updateRequest.onsuccess = () => cursor.continue();
      updateRequest.onerror = () => reject(updateRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
  await transactionDone(transaction);
  emitArchiveChanged();
}

function toExportMessage(message) {
  const normalized = normalizeArchivedMessage(message);
  return {
    id: normalized.id,
    conversationId: normalized.conversationId,
    sessionId: normalized.sessionId,
    role: normalized.role,
    content: normalized.content,
    createdAt: normalized.createdAt,
    quote: normalized.quote,
    reasoningContent: normalized.reasoningContent,
    reasoningSource: normalized.reasoningSource,
    reasoningVisible: normalized.reasoningVisible,
    readByUser: normalized.readByUser,
    readByDu: normalized.readByDu,
    status: normalized.status,
    excludedFromContext: normalized.excludedFromContext,
    deletedAt: normalized.deletedAt,
    supersededAt: normalized.supersededAt,
    responseGroupId: normalized.responseGroupId,
    chatSpaceId: normalized.chatSpaceId,
    meta: sanitizeMeta(normalized.meta),
  };
}

export async function exportMessagesJson() {
  const messages = await collectFromCursor({
    range: conversationRange(),
    direction: "next",
    limit: Number.MAX_SAFE_INTEGER,
    filter: isVisibleMessage,
  });
  return JSON.stringify(
    {
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      messages: messages.map(toExportMessage),
    },
    null,
    2
  );
}

export async function getMessageArchiveStats({ conversationId = DEFAULT_CONVERSATION_ID } = {}) {
  const db = await getReadyDb();
  const transaction = db.transaction(MESSAGE_STORE, "readonly");
  const totalCount = await requestResult(transaction.objectStore(MESSAGE_STORE).count());
  const visibleMessages = await collectFromCursor({
    range: conversationRange({ conversationId }),
    direction: "next",
    limit: Number.MAX_SAFE_INTEGER,
    filter: isVisibleMessage,
  });

  return {
    status: "available",
    totalCount: Number(totalCount || 0),
    visibleCount: visibleMessages.length,
    conversationId,
  };
}

export async function clearMessageArchive() {
  const db = await getReadyDb();
  const transaction = db.transaction(MESSAGE_STORE, "readwrite");
  transaction.objectStore(MESSAGE_STORE).clear();
  await transactionDone(transaction);
  emitArchiveChanged();
  return { ok: true };
}
