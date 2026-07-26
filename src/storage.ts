import type { Settings } from "./types";

const SETTINGS_KEY = "blogpost_settings";

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "gemini-2.5-flash",
};

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
