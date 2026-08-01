import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { ComposeInput, UploadedImage } from "../types";
import { CATEGORIES } from "../types";
import { base64ToUploadedImage, fileToUploadedImage } from "../imageUtils";
import { GalleryPicker } from "../galleryPicker";

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
  const [pickError, setPickError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { category, place, notes, businessName, hours, mapLink, images } = value;

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

  async function handlePickPhotos() {
    setPickError(null);
    // Native apps get the real gallery app (album browsing included) via a
    // custom plugin; the web dev preview has no such plugin, so it falls
    // back to the plain browser file picker instead.
    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }
    setLoadingImages(true);
    try {
      const { images: picked } = await GalleryPicker.pickImages();
      const newImages = await Promise.all(
        picked.map((img) => base64ToUploadedImage(img.base64, img.mimeType, img.fileName)),
      );
      onChange({ ...value, images: [...images, ...newImages] });
    } catch (e) {
      // "취소됨" is a plain user-cancel, not worth surfacing as an error
      const message = e instanceof Error ? e.message : String(e);
      if (!message.includes("취소")) {
        setPickError("사진을 불러오지 못했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoadingImages(false);
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
            <span>가게 상호명 (선택)</span>
            <input
              type="text"
              value={businessName}
              onChange={(e) => onChange({ ...value, businessName: e.target.value })}
              placeholder="예: 이모네해장국"
            />
            <p className="hint">
              장소/지역명과 별개로 정확한 상호명을 입력하면, AI가 이름을 지어내지 않고 이
              이름 그대로 본문과 정보 박스에 씁니다.
            </p>
          </label>

          <label className="field">
            <span>영업시간 (선택)</span>
            <textarea
              value={hours}
              onChange={(e) => onChange({ ...value, hours: e.target.value })}
              placeholder={"예:\n월-금 11:00~21:00 (브레이크타임 15:00~17:00)\n토 11:00~15:00\n일 휴무"}
              rows={4}
            />
            <p className="hint">
              요일별로 다르면 줄바꿈해서 나눠 입력하세요. 입력한 그대로 본문 정보 박스에
              들어가요 (AI가 지어내지 않아요).
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
          style={{ display: Capacitor.isNativePlatform() ? "none" : undefined }}
        />
        {Capacitor.isNativePlatform() && (
          <button
            type="button"
            className="ghost-btn"
            onClick={handlePickPhotos}
            disabled={loadingImages}
          >
            {loadingImages ? "불러오는 중..." : "갤러리에서 선택 (앨범 탐색 가능)"}
          </button>
        )}
        {pickError && <p className="error">{pickError}</p>}
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
      {busy && (
        <p className="hint">
          사진 수와 네트워크 속도에 따라 몇 분 정도 걸릴 수 있어요. 화면을 벗어나지 말고
          기다려주세요.
        </p>
      )}
    </div>
  );
}
