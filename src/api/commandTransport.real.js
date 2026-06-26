import { getCommandSettings } from "../store/settings.js";

const POLL_INTERVAL_MS = 5000;
const STREAM_RETRY_MS = 2500;

function readSettings() {
  const settings = getCommandSettings();
  return {
    apiBaseUrl: String(settings.apiBaseUrl || "").replace(/\/+$/, ""),
    token: String(settings.token || ""),
  };
}

function headers() {
  const { token } = readSettings();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function requestJson(path, options = {}) {
  const { apiBaseUrl } = readSettings();
  if (!apiBaseUrl) throw new Error("Command API base URL is empty");

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...headers(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Command API ${response.status}`);
  }

  return response.json();
}

function normalizeCommand(command = {}) {
  return {
    id: String(command.id),
    title: String(command.title || ""),
    countdown_seconds:
      Number.isFinite(Number(command.countdown_seconds)) && Number(command.countdown_seconds) > 0
        ? Number(command.countdown_seconds)
        : null,
    created_at: Number(command.created_at || Date.now()),
    started_at: command.started_at ? Number(command.started_at) : null,
    completed_at: command.completed_at ? Number(command.completed_at) : null,
  };
}

function normalizePending(payload) {
  const commands = Array.isArray(payload) ? payload : payload?.commands;
  return Array.isArray(commands) ? commands.map(normalizeCommand) : [];
}

export async function getPendingCommands() {
  return normalizePending(await requestJson("/api/commands/pending"));
}

export async function startCommand(id) {
  return normalizeCommand(await requestJson(`/api/commands/${encodeURIComponent(id)}/start`, { method: "POST" }));
}

export async function completeCommand(id) {
  return requestJson(`/api/commands/${encodeURIComponent(id)}/complete`, { method: "POST" });
}

export async function getPendingCommandFeedback() {
  const payload = await requestJson("/api/commands/feedback/pending");
  return Array.isArray(payload) ? payload : payload?.feedback || [];
}

export function subscribeCommands(onPending, onError) {
  let closed = false;
  let eventSource = null;
  let pollTimer = null;
  let retryTimer = null;

  const poll = async () => {
    if (closed) return;
    try {
      onPending(await getPendingCommands());
    } catch (error) {
      onError?.(error);
    } finally {
      if (!closed) pollTimer = window.setTimeout(poll, POLL_INTERVAL_MS);
    }
  };

  const startStream = () => {
    const { apiBaseUrl, token } = readSettings();
    if (!apiBaseUrl || typeof EventSource === "undefined") {
      poll();
      return;
    }

    const streamUrl = token
      ? `${apiBaseUrl}/api/commands/stream?token=${encodeURIComponent(token)}`
      : `${apiBaseUrl}/api/commands/stream`;

    eventSource = new EventSource(streamUrl);
    eventSource.onmessage = (event) => {
      try {
        onPending(normalizePending(JSON.parse(event.data)));
      } catch (error) {
        onError?.(error);
      }
    };
    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      if (!closed) retryTimer = window.setTimeout(poll, STREAM_RETRY_MS);
    };
  };

  startStream();

  return () => {
    closed = true;
    eventSource?.close();
    window.clearTimeout(pollTimer);
    window.clearTimeout(retryTimer);
  };
}
