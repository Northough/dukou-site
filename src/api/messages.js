import {
  clearMessageArchive,
  getLatestMessages,
  normalizeArchivedMessage,
  patchMessage,
  patchMessagesByRole,
  saveMessage,
} from "./messageArchive.js";

export async function getRecentMessages(limit = 20, options) {
  return getLatestMessages(limit, options);
}

export async function insertMessage({
  id,
  type,
  session_id,
  sessionId,
  conversationId,
  chatSpaceId,
  role,
  content,
  created_at,
  createdAt,
  read_by_user,
  readByUser,
  read_by_du,
  readByDu,
  status,
  excludedFromContext,
  deletedAt,
  supersededAt,
  responseGroupId,
  quote,
  reasoningContent,
  reasoningSource,
  reasoningVisible,
  meta = {},
}) {
  const record = normalizeArchivedMessage({
    id,
    type,
    session_id: session_id || sessionId,
    conversationId,
    chatSpaceId,
    role,
    content,
    created_at: created_at || createdAt,
    read_by_user: read_by_user ?? readByUser ?? role === "assistant",
    read_by_du: read_by_du ?? readByDu ?? (role === "user" ? false : undefined),
    status,
    excludedFromContext,
    deletedAt,
    supersededAt,
    responseGroupId,
    quote,
    reasoningContent,
    reasoningSource,
    reasoningVisible,
    meta,
  });

  return saveMessage(record);
}

export async function markDuMessagesRead(options) {
  await patchMessagesByRole("assistant", { readByUser: true, read_by_user: true }, options);
}

export async function markUserMessagesRead(options) {
  await patchMessagesByRole("user", { readByDu: true, read_by_du: true }, options);
}

export async function updateMessageRecord(id, patch) {
  return patchMessage(id, patch);
}

export async function clearLocalMessages() {
  return clearMessageArchive();
}
