import { useState } from "react";
import "./App.css";
import SettingsView from "./components/SettingsView";
import ComposeView from "./components/ComposeView";
import ResultView from "./components/ResultView";
import { loadSettings, saveSettings } from "./storage";
import { generatePost } from "./gemini";
import type { ComposeInput, GeneratedPost, Settings, UploadedImage } from "./types";

type Screen = "compose" | "settings" | "result";

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [screen, setScreen] = useState<Screen>("compose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ post: GeneratedPost; images: UploadedImage[] } | null>(
    null,
  );

  function handleSaveSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  async function handleGenerate(input: ComposeInput) {
    setError(null);
    setBusy(true);
    try {
      const post = await generatePost(settings, input);
      setResult({ post, images: input.images });
      setScreen("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>블로그 포스팅 AI</h1>
        <button className="icon-btn" onClick={() => setScreen("settings")} aria-label="설정">
          ⚙
        </button>
      </header>

      <main>
        {screen === "compose" && (
          <ComposeView onGenerate={handleGenerate} busy={busy} errorMessage={error} />
        )}
        {screen === "settings" && (
          <SettingsView
            settings={settings}
            onSave={handleSaveSettings}
            onClose={() => setScreen("compose")}
          />
        )}
        {screen === "result" && result && (
          <ResultView
            post={result.post}
            images={result.images}
            onBack={() => {
              setResult(null);
              setScreen("compose");
            }}
          />
        )}
      </main>
    </div>
  );
}
