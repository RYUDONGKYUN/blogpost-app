import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { designOutline, findKeywords, generateSeoContent } from "../seo";
import { loadRecentHistory } from "../storage";
import { fileToUploadedImage, nativeImageToUploadedImage } from "../imageUtils";
import { GalleryPicker } from "../galleryPicker";
import { SEO_PURPOSES } from "../types";
import type { GeneratedPost, SeoState, Settings, UploadedImage } from "../types";

interface Props {
  value: SeoState;
  onChange: (next: SeoState) => void;
  settings: Settings;
  onComplete: (post: GeneratedPost, images: UploadedImage[]) => void;
}

const STEPS: { key: SeoState["stage"]; label: string; icon: string }[] = [
  { key: "topic", label: "키워드", icon: "🔍" },
  { key: "keywords", label: "구조", icon: "🧭" },
  { key: "outline", label: "본문", icon: "✍️" },
];

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function SeoView({ value, onChange, settings, onComplete }: Props) {
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingSection, setLoadingSection] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetSectionRef = useRef<number | null>(null);

  const {
    stage,
    topic,
    purpose,
    keywordResult,
    selectedSub,
    selectedRelated,
    selectedTitle,
    outline,
    sectionImages,
  } = value;

  async function handleFindKeywords() {
    if (!topic.trim()) {
      setError("주제를 입력해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    setBusyLabel("황금 키워드를 찾는 중...");
    try {
      const history = loadRecentHistory("SEO정보글");
      const result = await findKeywords(settings, { topic, purpose }, history);
      onChange({
        ...value,
        keywordResult: result,
        selectedSub: result.subKeywords,
        selectedRelated: result.relatedKeywords,
        selectedTitle: result.titleCandidates[0] ?? "",
        stage: "keywords",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
      setError(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDesignOutline() {
    if (!selectedTitle) {
      setError("제목을 하나 선택해주세요.");
      return;
    }
    const keywords = [...selectedSub, ...selectedRelated];
    if (keywords.length === 0) {
      setError("키워드를 1개 이상 선택해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    setBusyLabel("글 구조를 설계하는 중...");
    try {
      const result = await designOutline(settings, { topic, purpose }, selectedTitle, keywords);
      onChange({
        ...value,
        outline: result,
        sectionImages: result.sections.map(() => []),
        stage: "outline",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
      setError(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  function addImagesToSection(sectionIndex: number, images: UploadedImage[]) {
    const next = [...sectionImages];
    next[sectionIndex] = [...(next[sectionIndex] ?? []), ...images];
    onChange({ ...value, sectionImages: next });
  }

  function removeImageFromSection(sectionIndex: number, imageId: string) {
    const next = [...sectionImages];
    next[sectionIndex] = (next[sectionIndex] ?? []).filter((img) => img.id !== imageId);
    onChange({ ...value, sectionImages: next });
  }

  async function handlePickPhotosForSection(sectionIndex: number) {
    if (!Capacitor.isNativePlatform()) {
      targetSectionRef.current = sectionIndex;
      fileInputRef.current?.click();
      return;
    }
    setLoadingSection(sectionIndex);
    try {
      const { images: picked } = await GalleryPicker.pickImages();
      const newImages = picked.map((img) =>
        nativeImageToUploadedImage(img.base64, img.mimeType, img.fileName),
      );
      addImagesToSection(sectionIndex, newImages);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!message.includes("취소")) {
        window.alert("사진을 불러오지 못했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoadingSection(null);
    }
  }

  async function handleFileInputChange(files: FileList | null) {
    const sectionIndex = targetSectionRef.current;
    if (!files || files.length === 0 || sectionIndex === null) return;
    setLoadingSection(sectionIndex);
    try {
      const newImages = await Promise.all(Array.from(files).map(fileToUploadedImage));
      addImagesToSection(sectionIndex, newImages);
    } catch {
      window.alert("사진을 불러오지 못했습니다. 다시 시도해주세요.");
    } finally {
      setLoadingSection(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleGenerateContent() {
    if (!outline) return;
    setError(null);
    setBusy(true);
    setBusyLabel("본문을 쓰는 중...");
    try {
      const keywords = [...selectedSub, ...selectedRelated];
      const history = loadRecentHistory("SEO정보글");
      const { post, images } = await generateSeoContent(
        settings,
        { topic, purpose },
        outline,
        selectedTitle,
        keywords,
        sectionImages,
        history,
        (s) => setBusyLabel(s === "draft" ? "본문을 쓰는 중..." : "사람 손길로 다듬는 중..."),
      );
      onComplete(post, images);
    } catch (e) {
      const message = e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
      setError(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === stage);

  return (
    <div className="view">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleFileInputChange(e.target.files)}
      />

      <div className="seo-stepper">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`seo-stepper-step ${
              i < stepIndex ? "seo-step-done" : i === stepIndex ? "seo-step-current" : ""
            }`}
          >
            <span className="seo-stepper-icon">{i < stepIndex ? "✓" : s.icon}</span>
            <span className="seo-stepper-label">{s.label}</span>
          </div>
        ))}
      </div>

      {stage === "topic" && (
        <>
          <label className="field">
            <span>어떤 주제로 글을 쓸까요?</span>
            <input
              type="text"
              value={topic}
              onChange={(e) => onChange({ ...value, topic: e.target.value })}
              placeholder="예: 스레드 조회수 10만 만드는 방법"
            />
          </label>

          <label className="field">
            <span>글의 목적·분위기</span>
            <div className="chip-row">
              {SEO_PURPOSES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`chip ${purpose === p ? "chip-active" : ""}`}
                  onClick={() => onChange({ ...value, purpose: p })}
                >
                  {p}
                </button>
              ))}
            </div>
          </label>

          {error && <p className="error">{error}</p>}

          <div className="actions">
            <button
              className="primary-btn"
              onClick={handleFindKeywords}
              disabled={busy || !topic.trim()}
            >
              {busy ? (
                <>
                  <span className="spinner" /> {busyLabel}
                </>
              ) : (
                "황금 키워드 찾기"
              )}
            </button>
          </div>
        </>
      )}

      {stage === "keywords" && keywordResult && (
        <>
          <div className="field">
            <span>서브 키워드 (탭해서 선택/해제)</span>
            <div className="chip-row">
              {keywordResult.subKeywords.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip ${selectedSub.includes(k) ? "chip-active" : ""}`}
                  onClick={() => onChange({ ...value, selectedSub: toggleInList(selectedSub, k) })}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>연관 키워드 (탭해서 선택/해제)</span>
            <div className="chip-row">
              {keywordResult.relatedKeywords.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip ${selectedRelated.includes(k) ? "chip-active" : ""}`}
                  onClick={() =>
                    onChange({ ...value, selectedRelated: toggleInList(selectedRelated, k) })
                  }
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>제목 후보 (하나를 선택하세요)</span>
            {keywordResult.titleCandidates.map((title) => (
              <button
                key={title}
                type="button"
                className={`option-card ${selectedTitle === title ? "option-card-active" : ""}`}
                onClick={() => onChange({ ...value, selectedTitle: title })}
              >
                <span className="option-card-dot" />
                {title}
              </button>
            ))}
          </div>

          {error && <p className="error">{error}</p>}

          <div className="actions">
            <button
              className="ghost-btn"
              onClick={() => onChange({ ...value, stage: "topic" })}
              disabled={busy}
            >
              이전
            </button>
            <button className="primary-btn" onClick={handleDesignOutline} disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" /> {busyLabel}
                </>
              ) : (
                "글 구조 설계하기"
              )}
            </button>
          </div>
        </>
      )}

      {stage === "outline" && outline && (
        <>
          <div className="field">
            <span>예상 분량</span>
            <div className="result-box">약 {outline.estimatedLength.toLocaleString()}자</div>
          </div>

          <div className="field">
            <span>
              SEO 구조 설계 완료 <span className="hint">(항목마다 필요하면 사진을 추가하세요)</span>
            </span>
            {outline.sections.map((section, i) => {
              const images = sectionImages[i] ?? [];
              return (
                <div key={i} className="outline-section">
                  <strong>
                    {i + 1}. {section.heading}
                  </strong>
                  <ul>
                    {section.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>

                  {images.length > 0 && (
                    <div className="thumb-grid outline-thumb-grid">
                      {images.map((img) => (
                        <div key={img.id} className="thumb">
                          <img src={img.dataUrl} alt={img.fileName} />
                          <button
                            type="button"
                            className="thumb-remove"
                            onClick={() => removeImageFromSection(i, img.id)}
                            aria-label="사진 삭제"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="ghost-btn outline-photo-btn"
                    onClick={() => handlePickPhotosForSection(i)}
                    disabled={loadingSection === i}
                  >
                    {loadingSection === i ? (
                      <>
                        <span className="spinner" /> 불러오는 중...
                      </>
                    ) : (
                      "📷 이 항목에 사진 추가"
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {error && <p className="error">{error}</p>}

          <div className="actions">
            <button
              className="ghost-btn"
              onClick={() => onChange({ ...value, stage: "keywords" })}
              disabled={busy}
            >
              이전
            </button>
            <button className="primary-btn" onClick={handleGenerateContent} disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" /> {busyLabel}
                </>
              ) : (
                "이 구조로 본문 생성하기"
              )}
            </button>
          </div>
          {busy && (
            <p className="hint">
              구조에 맞춰 초안을 쓴 뒤, 사람이 쓴 것처럼 자연스럽게 한 번 더 다듬어요. 1~2분 정도
              걸릴 수 있어요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
