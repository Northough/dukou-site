import { getCommandSettings } from "../store/settings.js";
import * as realTransport from "./commandTransport.real.js";

const MOCK_COMMAND_DELAY_MS = 3500;

let mockId = 1;
let mockCommands = [];
let mockFeedback = [];
let listeners = new Set();
let mockTimer = null;

function now() {
  return Date.now();
}

function normalizeCommand(command = {}) {
  return {
    id: String(command.id),
    title: String(command.title || "站起来喝一口水"),
    countdown_seconds:
      Number.isFinite(Number(command.countdown_seconds)) && Number(command.countdown_seconds) > 0
        ? Number(command.countdown_seconds)
        : null,
    created_at: Number(command.created_at || now()),
    started_at: command.started_at ? Number(command.started_at) : null,
    completed_at: command.completed_at ? Number(command.completed_at) : null,
  };
}

function shouldUseRealTransport() {
  return getCommandSettings().transportMode === "real";
}

function emitPending() {
  const pending = mockCommands.filter((command) => !command.completed_at).map(normalizeCommand);
  listeners.forEach((listener) => listener(pending));
}

function scheduleMockCommand() {
  if (mockTimer) return;
  mockTimer = window.setTimeout(() => {
    mockCommands.push(
      normalizeCommand({
        id: mockId++,
        title: "读两页书，然后回来点完成",
        countdown_seconds: 150,
        created_at: now(),
      })
    );
    emitPending();
  }, MOCK_COMMAND_DELAY_MS);
}

export function subscribeCommands(onPending) {
  if (shouldUseRealTransport()) {
    return realTransport.subscribeCommands(onPending);
  }

  listeners.add(onPending);
  scheduleMockCommand();
  onPending(mockCommands.filter((command) => !command.completed_at).map(normalizeCommand));

  return () => {
    listeners.delete(onPending);
  };
}

export async function getPendingCommands() {
  if (shouldUseRealTransport()) {
    return realTransport.getPendingCommands();
  }

  return mockCommands.filter((command) => !command.completed_at).map(normalizeCommand);
}

export async function startCommand(id) {
  if (shouldUseRealTransport()) {
    return realTransport.startCommand(id);
  }

  const command = mockCommands.find((item) => String(item.id) === String(id));
  if (!command) return null;
  if (!command.started_at) command.started_at = now();
  emitPending();
  return normalizeCommand(command);
}

export async function completeCommand(id) {
  if (shouldUseRealTransport()) {
    return realTransport.completeCommand(id);
  }

  const command = mockCommands.find((item) => String(item.id) === String(id));
  if (!command) return null;

  const completedAt = now();
  const startedAt = command.started_at || completedAt;
  command.started_at = startedAt;
  command.completed_at = completedAt;
  command.duration_ms = completedAt - startedAt;
  command.vs_countdown_ms = command.countdown_seconds ? command.duration_ms - command.countdown_seconds * 1000 : null;
  mockFeedback.push({
    id: `mock-feedback-${command.id}`,
    command_id: command.id,
    title: command.title,
    duration_ms: command.duration_ms,
    vs_countdown_ms: command.vs_countdown_ms,
    completed_at: completedAt,
  });
  emitPending();

  return {
    ...normalizeCommand(command),
    duration_ms: command.duration_ms,
    vs_countdown_ms: command.vs_countdown_ms,
  };
}

export async function getPendingCommandFeedback() {
  if (shouldUseRealTransport()) {
    return realTransport.getPendingCommandFeedback();
  }

  const feedback = [...mockFeedback];
  mockFeedback = [];
  return feedback;
}
