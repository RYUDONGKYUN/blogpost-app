import { useState } from "react";
import type { Settings } from "../types";

interface Props {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export default function SettingsView({ settings, onSave, onClose }: Props) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [showKey, setShowKey] = useState(false);

  function handleSave() {
    onSave({ apiKey: apiKey.trim(), model: model.trim() || "gemini-2.5-flash" });
    onClose();
  }

  return (
    <div className="view">
      <h2>설정</h2>

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
          placeholder="gemini-2.5-flash"
        />
        <p className="hint">모델이 만료/변경되면 여기서 이름만 바꿔주면 됩니다.</p>
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
