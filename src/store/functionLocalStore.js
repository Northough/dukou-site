export const FUNCTION_STORAGE_KEYS = {
  reminders: "dukou:reminders:v1",
  schedule: "dukou:schedule:v1",
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(key) {
  if (!canUseLocalStorage()) return null;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  if (canUseLocalStorage()) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

function removeItem(key) {
  if (canUseLocalStorage()) {
    window.localStorage.removeItem(key);
  }
}

function readArray(key, fallback) {
  const value = readJson(key);
  return Array.isArray(value) ? value : clone(fallback);
}

export function getTodayDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysToDateString(dateString, days) {
  if (!dateString) return "";

  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) return "";

  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return getTodayDateString(date);
}

export function loadReminders(fallback = []) {
  return readArray(FUNCTION_STORAGE_KEYS.reminders, fallback);
}

export function saveReminders(value) {
  writeJson(FUNCTION_STORAGE_KEYS.reminders, Array.isArray(value) ? value : []);
}

export function loadSchedule(fallback = []) {
  return readArray(FUNCTION_STORAGE_KEYS.schedule, fallback);
}

export function saveSchedule(value) {
  writeJson(FUNCTION_STORAGE_KEYS.schedule, Array.isArray(value) ? value : []);
}

export function clearFunctionLocalStore() {
  Object.values(FUNCTION_STORAGE_KEYS).forEach(removeItem);
}

export function resetFunctionLocalStore(defaults = {}) {
  saveReminders(defaults.reminders || []);
  saveSchedule(defaults.schedule || []);
}
