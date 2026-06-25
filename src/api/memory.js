import { sampleMemories } from "../fixtures/sampleMemories.js";
import { getMemorySettings } from "../store/settings.js";

const HIDDEN_MEMORY_KEY = "dukou:hiddenMemories";

function getHiddenIds() {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(HIDDEN_MEMORY_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveHiddenIds(ids) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(HIDDEN_MEMORY_KEY, JSON.stringify([...ids]));
  }
}

function applyHidden(memories) {
  const hiddenIds = getHiddenIds();
  return memories.filter((memory) => !hiddenIds.has(String(memory.id)));
}

function getMockMemories(limit) {
  return applyHidden(sampleMemories).slice(0, limit);
}

function isExternallyManaged(settings = getMemorySettings()) {
  return ["kiwi_managed", "ombre_dashboard"].includes(settings?.memoryMode);
}

export async function getInjectedMemories(limit = 8, settings = getMemorySettings()) {
  if (isExternallyManaged(settings)) return [];
  return getMockMemories(limit);
}

export async function getMemoryDrawerState(limit = 30, settings = getMemorySettings()) {
  if (settings?.memoryMode === "kiwi_managed") {
    return {
      mode: "kiwi_managed",
      items: [],
      message: "长期记忆由 kiwi-mem 接管。当前前端不读取 kiwi 内部记忆列表，也不提供删除或归档操作。",
    };
  }

  if (settings?.memoryMode === "ombre_dashboard") {
    return {
      mode: "ombre_dashboard",
      items: [],
      message: "OmbreBrain dashboard 接管记忆后台。当前前端不读取 mock 记忆，也不提供本地归档操作。",
    };
  }

  return {
    mode: "mock",
    items: getMockMemories(limit),
    message: "",
  };
}

export async function getMemoryDrawerItems(limit = 30, settings = getMemorySettings()) {
  if (isExternallyManaged(settings)) return [];
  return getMockMemories(limit);
}

export async function hideMemory(id, settings = getMemorySettings()) {
  if (isExternallyManaged(settings)) return { ok: false, mode: settings?.memoryMode || "external" };

  const hiddenIds = getHiddenIds();
  hiddenIds.add(String(id));
  saveHiddenIds(hiddenIds);
  return { ok: true, mode: "local" };
}

export async function getEmotionState() {
  return { valence: 0.5, arousal: 0.45, last_note: "mock calm" };
}
