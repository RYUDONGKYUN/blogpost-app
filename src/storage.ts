import type { Category, PostHistoryEntry, Settings } from "./types";

const SETTINGS_KEY = "blogpost_settings";
const HISTORY_KEY = "blogpost_history";

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "gemini-3.6-flash",
};

/** total saved posts kept across all categories, oldest dropped first */
const HISTORY_MAX_TOTAL = 100;
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
    if (!Array.isArray(parsed)) return [];
    // drop entries saved by older app versions that predate the full-post archive shape
    return parsed.filter(
      (entry): entry is PostHistoryEntry =>
        typeof entry?.id === "string" &&
        typeof entry?.body === "string" &&
        Array.isArray(entry?.keywords),
    );
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

/** all saved posts, newest first, for the history/archive screen */
export function loadArchive(): PostHistoryEntry[] {
  return [...loadAllHistory()].reverse();
}

export function addHistoryEntry(entry: PostHistoryEntry): void {
  const all = loadAllHistory();
  all.push(entry);
  const trimmed = all.slice(-HISTORY_MAX_TOTAL);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}
