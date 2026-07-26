import { useRef, useState } from "react";
import type { ComposeInput, UploadedImage } from "../types";
import { CATEGORIES } from "../types";
import { fileToUploadedImage } from "../imageUtils";

interface Props {
  value: ComposeInput;
  onChange: (value: ComposeInput) => void;
  onGenerate: () => void;
  busy: boolean;
  errorMessage: string | null;
  /** true while a clarifying question is awaiting an answer */
  blocked: boolean;
}

export default function ComposeView({
  value,
  onChange,
  onGenerate,
  busy,
  errorMessage,
  blocked,
}: Props) {
  const [loadingImages, setLoadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { category, place, notes, hours, mapLink, images } = value;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLoadingImages(true);
    try {
      const newImages = await Promise.all(Array.from(files).map(fileToUploadedImage));
      onChange({ ...value, images: [...images, ...newImages] });
    } finally {
      setLoadingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeImage(id: string) {
    onChange({ ...value, images: images.filter((img: UploadedImage) => img.id !== id) });
  }

  return (
    <div className="view">
      <h2>새 포스팅 만들기</h2>

      <label className="field">
        <span>카테고리</span>
        <div className="chip-row">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${category === c ? "chip-active" : ""}`}
              onClick={() => onChange({ ...value, category: c })}
            >
              {c}
            </button>
          ))}
        </div>
      </label>

      <label className="field">
        <span>{category === "레시피" ? "요리 이름 (선택)" : "장소/지역명 (선택)"}</span>
        <input
          type="text"
          value={place}
          onChange={(e) => onChange({ ...value, place: e.target.value })}
          placeholder={
            category === "레시피" ? "예: 김치볶음밥, 계란찜" : "예: 구리, 강남역, 제주도"
          }
        />
      </label>

      {category === "맛집" && (
        <>
          <label className="field">
            <span>영업시간 (선택)</span>
            <input
              type="text"
              value={hours}
              onChange={(e) => onChange({ ...value, hours: e.target.value })}
              placeholder="예: 매일 11:00~21:00 (브레이크타임 15:00~17:00, 월요일 휴무)"
            />
            <p className="hint">
              입력하면 본문에 인용구 형태의 정보 박스로 그대로 들어가요 (AI가 지어내지 않아요).
            </p>
          </label>

          <label className="field">
            <span>네이버지도 공유 링크 (선택)</span>
            <input
              type="url"
              value={mapLink}
              onChange={(e) => onChange({ ...value, mapLink: e.target.value })}
              placeholder="예: https://naver.me/xxxxxxx"
            />
            <p className="hint">
              네이버지도 앱에서 장소 공유 → 링크 복사한 걸 붙여넣으면 정보 박스에 함께 들어가요.
            </p>
          </label>
        </>
      )}

      <label className="field">
        <span>추가로 알려주고 싶은 내용 (선택)</span>
        <textarea
          value={notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder={
            category === "레시피"
              ? "몇 인분, 조리 시간, 맛 조절 팁 등 자유롭게 입력하세요"
              : "메뉴 이름, 가격, 특이사항 등 자유롭게 입력하세요"
          }
          rows={3}
        />
      </label>

      <label className="field">
        <span>사진 ({images.length}장)</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          disabled={loadingImages}
        />
        {category === "레시피" && (
          <p className="hint">
            재료 사진 → 만드는 과정 사진 → 완성 사진 순서로 올려주시면 더 정확하게 정리해줘요.
          </p>
        )}
      </label>

      {images.length > 0 && (
        <div className="thumb-grid">
          {images.map((img, idx) => (
            <div key={img.id} className="thumb">
              <img src={img.dataUrl} alt={img.fileName} />
              <span className="thumb-index">{idx + 1}</span>
              <button
                type="button"
                className="thumb-remove"
                onClick={() => removeImage(img.id)}
                aria-label="사진 삭제"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {errorMessage && <p className="error">{errorMessage}</p>}

      <div className="actions">
        <button
          className="primary-btn"
          onClick={onGenerate}
          disabled={busy || loadingImages || images.length === 0 || blocked}
        >
          {busy ? "글 작성 중..." : "블로그 글 생성하기"}
        </button>
      </div>
    </div>
  );
}
