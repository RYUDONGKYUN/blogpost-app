import { useMemo, useState } from "react";
import { Clipboard } from "@capacitor/clipboard";
import type { GeneratedPost, UploadedImage } from "../types";

interface Props {
  post: GeneratedPost;
  images: UploadedImage[];
  onBack: () => void;
}

export default function ResultView({ post, images, onBack }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const fullText = useMemo(() => {
    const hashtags = post.keywords.map((k) => `#${k.replace(/\s+/g, "")}`).join(" ");
    return `${post.title}\n\n${post.body}\n\n${hashtags}`;
  }, [post]);

  async function handleCopy() {
    setCopyError(null);
    try {
      await Clipboard.write({ string: fullText });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("복사에 실패했습니다. 아래 본문을 길게 눌러 직접 복사해주세요.");
    }
  }

  function shareImage(img: UploadedImage) {
    const link = document.createElement("a");
    link.href = img.dataUrl;
    link.download = img.fileName || "photo.jpg";
    link.click();
  }

  return (
    <div className="view">
      <h2>완성된 포스팅</h2>

      <div className="field">
        <span>제목</span>
        <div className="result-box">{post.title}</div>
      </div>

      <div className="field">
        <span>키워드</span>
        <div className="chip-row">
          {post.keywords.map((k) => (
            <span key={k} className="chip">
              {k}
            </span>
          ))}
        </div>
      </div>

      <div className="field">
        <span>본문 (사진 삽입 위치는 [사진1], [사진2]... 표시를 참고하세요)</span>
        <pre className="result-box result-body">{post.body}</pre>
      </div>

      <div className="actions">
        <button className="primary-btn" onClick={handleCopy}>
          {copied ? "복사됨 ✓" : "전체 글 복사하기"}
        </button>
      </div>
      {copyError && <p className="error">{copyError}</p>}

      <div className="field">
        <span>사진 (아래 번호와 본문의 [사진N] 표시가 서로 대응합니다)</span>
        <div className="thumb-grid">
          {images.map((img, idx) => (
            <div key={img.id} className="thumb thumb-result">
              <img src={img.dataUrl} alt={img.fileName} />
              <span className="thumb-index">{idx + 1}</span>
              <button type="button" className="thumb-save" onClick={() => shareImage(img)}>
                저장
              </button>
            </div>
          ))}
        </div>
        <p className="hint">
          네이버 블로그 앱/에디터에 사진을 순서대로 첨부한 뒤, 위에서 복사한 글을 붙여넣고
          [사진N] 표시 위치에 맞게 사진을 배치해주세요.
        </p>
      </div>

      <div className="actions">
        <button className="ghost-btn" onClick={onBack}>
          새 포스팅 만들기
        </button>
      </div>
    </div>
  );
}
