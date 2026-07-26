import type { Category, PostHistoryEntry, Settings } from "./types";

const SETTINGS_KEY = "blogpost_settings";
const HISTORY_KEY = "blogpost_history";

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "gemini-2.5-flash",
};

/** total entries kept across all categories, oldest dropped first */
const HISTORY_MAX_TOTAL = 40;
/** entries per category actually sent to the model as "don't repeat this" context */
const HISTORY_PROMPT_COUNT = 5;

export function loadSettings(): Settings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadAllHistory(): PostHistoryEntry[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** most recent entries for this category, oldest first, for use in the prompt */
export function loadRecentHistory(category: Category): PostHistoryEntry[] {
  return loadAllHistory()
    .filter((entry) => entry.category === category)
    .slice(-HISTORY_PROMPT_COUNT);
}

export function addHistoryEntry(entry: PostHistoryEntry): void {
  const all = loadAllHistory();
  all.push(entry);
  const trimmed = all.slice(-HISTORY_MAX_TOTAL);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}
