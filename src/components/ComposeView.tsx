import { useRef, useState } from "react";
import type { Category, ComposeInput, UploadedImage } from "../types";
import { CATEGORIES } from "../types";
import { fileToUploadedImage } from "../imageUtils";

interface Props {
  onGenerate: (input: ComposeInput) => void;
  busy: boolean;
  errorMessage: string | null;
}

export default function ComposeView({ onGenerate, busy, errorMessage }: Props) {
  const [category, setCategory] = useState<Category>("맛집");
  const [place, setPlace] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLoadingImages(true);
    try {
      const newImages = await Promise.all(Array.from(files).map(fileToUploadedImage));
      setImages((prev) => [...prev, ...newImages]);
    } finally {
      setLoadingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }

  function handleSubmit() {
    onGenerate({ category, place, notes, images });
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
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </label>

      <label className="field">
        <span>장소/지역명 (선택)</span>
        <input
          type="text"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="예: 구리, 강남역, 제주도"
        />
      </label>

      <label className="field">
        <span>추가로 알려주고 싶은 내용 (선택)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="메뉴 이름, 가격, 특이사항 등 자유롭게 입력하세요"
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
          onClick={handleSubmit}
          disabled={busy || loadingImages || images.length === 0}
        >
          {busy ? "글 작성 중..." : "블로그 글 생성하기"}
        </button>
      </div>
    </div>
  );
}
