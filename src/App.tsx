import { useCallback, useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Toast } from "@capacitor/toast";
import "./App.css";
import SettingsView from "./components/SettingsView";
import ComposeView from "./components/ComposeView";
import ResultView from "./components/ResultView";
import HistoryView from "./components/HistoryView";
import { addHistoryEntry, loadArchive, loadRecentHistory, loadSettings, saveSettings } from "./storage";
import { generatePost } from "./gemini";
import { makeThumbnail } from "./imageUtils";
import type { ClarificationTurn, ComposeInput, GeneratedPost, Settings, UploadedImage } from "./types";

type Screen = "compose" | "settings" | "result" | "history";

const EMPTY_COMPOSE: ComposeInput = {
  category: "맛집",
  place: "",
  notes: "",
  hours: "",
  mapLink: "",
  images: [],
};

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [screen, setScreen] = useState<Screen>("compose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composeInput, setComposeInput] = useState<ComposeInput>(EMPTY_COMPOSE);
  const [qaHistory, setQaHistory] = useState<ClarificationTurn[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [result, setResult] = useState<{ post: GeneratedPost; images: UploadedImage[] } | null>(
    null,
  );

  function handleSaveSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  function resetCompose() {
    setComposeInput(EMPTY_COMPOSE);
    setQaHistory([]);
    setPendingQuestion(null);
    setAnswerDraft("");
  }

  const goBackToMain = useCallback(() => {
    // Only clear the in-progress draft when leaving the "new post" result
    // flow — going back from settings/history shouldn't wipe whatever the
    // user was mid-typing on the compose screen.
    if (screen === "result") {
      setResult(null);
      resetCompose();
    }
    setScreen("compose");
  }, [screen]);

  // Hardware back button: from any sub-screen, return to the main compose
  // screen (mirrors the on-screen back buttons). From the main screen,
  // require a second press within 2s to exit — the familiar "한 번 더
  // 누르면 종료" pattern — so a single stray back press can't quit the app.
  useEffect(() => {
    let doubleBackArmed = false;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    const listenerPromise = CapacitorApp.addListener("backButton", () => {
      if (screen !== "compose") {
        goBackToMain();
        return;
      }
      if (doubleBackArmed) {
        CapacitorApp.exitApp();
        return;
      }
      doubleBackArmed = true;
      Toast.show({ text: "뒤로가기를 한 번 더 누르면 종료됩니다", duration: "short" }).catch(() => {});
      resetTimer = setTimeout(() => {
        doubleBackArmed = false;
      }, 2000);
    });

    return () => {
      if (resetTimer) clearTimeout(resetTimer);
      listenerPromise.then((listener) => listener.remove());
    };
  }, [screen, goBackToMain]);

  async function runGenerate(qa: ClarificationTurn[]) {
    setError(null);
    setBusy(true);
    try {
      const history = loadRecentHistory(composeInput.category);
      const result = await generatePost(settings, composeInput, history, qa);

      if (result.resolvedModel) {
        handleSaveSettings({ ...settings, model: result.resolvedModel });
      }

      if (result.status === "needs_info") {
        setPendingQuestion(result.question);
        return;
      }

      setPendingQuestion(null);
      setQaHistory([]);
      const thumbnail = composeInput.images[0]
        ? await makeThumbnail(composeInput.images[0].dataUrl).catch(() => undefined)
        : undefined;
      addHistoryEntry({
        id: crypto.randomUUID(),
        category: composeInput.category,
        place: composeInput.place,
        title: result.post.title,
        keywords: result.post.keywords,
        body: result.post.body,
        thumbnail,
        createdAt: Date.now(),
      });
      setResult({ post: result.post, images: composeInput.images });
      setScreen("result");
    } catch (e) {
      const message = e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
      setError(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  function handleGenerate() {
    runGenerate(qaHistory);
  }

  function handleAnswerSubmit() {
    if (!pendingQuestion || !answerDraft.trim()) return;
    const nextQa = [...qaHistory, { question: pendingQuestion, answer: answerDraft.trim() }];
    setQaHistory(nextQa);
    setAnswerDraft("");
    runGenerate(nextQa);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>블로그 포스팅 AI</h1>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => setScreen("history")} aria-label="작성 기록">
            🕘
          </button>
          <button className="icon-btn" onClick={() => setScreen("settings")} aria-label="설정">
            ⚙
          </button>
        </div>
      </header>

      <main>
        {screen === "compose" && (
          <>
            <ComposeView
              value={composeInput}
              onChange={setComposeInput}
              onGenerate={handleGenerate}
              busy={busy}
              errorMessage={error}
              blocked={!!pendingQuestion}
            />
            {pendingQuestion && (
              <div className="view clarification-box">
                <p>
                  <strong>글을 쓰기 전에 하나만 확인할게요:</strong>
                  <br />
                  {pendingQuestion}
                </p>
                <textarea
                  value={answerDraft}
                  onChange={(e) => setAnswerDraft(e.target.value)}
                  rows={2}
                  placeholder="답변을 입력하세요"
                />
                <div className="actions">
                  <button
                    className="primary-btn"
                    onClick={handleAnswerSubmit}
                    disabled={busy || !answerDraft.trim()}
                  >
                    {busy ? "다시 작성 중..." : "답변하고 계속 작성하기"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {screen === "settings" && (
          <SettingsView settings={settings} onSave={handleSaveSettings} onClose={goBackToMain} />
        )}
        {screen === "history" && <HistoryView entries={loadArchive()} onBack={goBackToMain} />}
        {screen === "result" && result && (
          <ResultView post={result.post} images={result.images} onBack={goBackToMain} />
        )}
      </main>
    </div>
  );
}
