import { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import type { Settings } from "../types";
import { listAvailableModels } from "../gemini";

interface Props {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export default function SettingsView({ settings, onSave, onClose }: Props) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [showKey, setShowKey] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    // No web implementation (no native package to read a version from), so
    // this silently stays null in the browser dev preview.
    CapacitorApp.getInfo()
      .then((info) => setAppVersion(info.version))
      .catch(() => setAppVersion(null));
  }, []);

  function handleSave() {
    onSave({ apiKey: apiKey.trim(), model: model.trim() || settings.model });
    onClose();
  }

  async function handleLoadModels() {
    setModelError(null);
    setLoadingModels(true);
    try {
      const models = await listAvailableModels(apiKey);
      setAvailableModels(models);
      if (models.length === 0) {
        setModelError("이 키로 사용 가능한 모델을 찾지 못했습니다.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "모델 목록을 불러오지 못했습니다.";
      setModelError(message);
      window.alert(message);
    } finally {
      setLoadingModels(false);
    }
  }

  return (
    <div className="view">
      <h2>설정</h2>
      {appVersion && <p className="hint">현재 앱 버전: v{appVersion}</p>}

      <label className="field">
        <span>Gemini API 키</span>
        <div className="key-input-row">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
            autoComplete="off"
          />
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? "숨기기" : "보기"}
          </button>
        </div>
        <p className="hint">
          키는 이 기기에만 저장되며 외부로 전송되지 않습니다 (Google Gemini API 호출에만 사용).
          Google AI Studio에서 무료로 발급받을 수 있습니다.
        </p>
      </label>

      <label className="field">
        <span>모델 이름</span>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={settings.model}
        />
        <button
          type="button"
          className="ghost-btn"
          onClick={handleLoadModels}
          disabled={loadingModels || !apiKey.trim()}
        >
          {loadingModels ? "불러오는 중..." : "사용 가능한 모델 불러오기"}
        </button>
        <p className="hint">
          구글이 모델 이름을 바꾸거나 새 버전을 내놓아도, 이 버튼으로 지금 이 키가 실제 지원하는
          모델 목록을 바로 확인하고 고를 수 있어요. 키를 새로 발급받은 경우에도 마찬가지입니다.
        </p>
        {modelError && <p className="error">{modelError}</p>}
        {availableModels.length > 0 && (
          <div className="chip-row">
            {availableModels.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${model === m ? "chip-active" : ""}`}
                onClick={() => setModel(m)}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </label>

      <div className="actions">
        <button className="primary-btn" onClick={handleSave}>
          저장
        </button>
        <button className="ghost-btn" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}
