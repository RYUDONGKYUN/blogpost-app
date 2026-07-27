import { useMemo, useState } from "react";
import { Clipboard } from "@capacitor/clipboard";
import type { GeneratedPost, UploadedImage } from "../types";
import { composeFullText, composeHashtags, splitBodyIntoSegments } from "../postText";

interface Props {
  post: GeneratedPost;
  images: UploadedImage[];
  onBack: () => void;
}

type Step =
  | { kind: "title"; text: string }
  | { kind: "text"; text: string }
  | { kind: "photo"; photoIndex: number }
  | { kind: "hashtags"; text: string };

function shareImage(img: UploadedImage) {
  const link = document.createElement("a");
  link.href = img.dataUrl;
  link.download = img.fileName || "photo.jpg";
  link.click();
}

export default function ResultView({ post, images, onBack }: Props) {
  const [mode, setMode] = useState<"guided" | "full">("guided");
  const [stepIndex, setStepIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const fullText = useMemo(() => composeFullText(post), [post]);
  const steps = useMemo<Step[]>(() => {
    const bodySteps = splitBodyIntoSegments(post.body).map((seg): Step =>
      seg.type === "text" ? { kind: "text", text: seg.text } : { kind: "photo", photoIndex: seg.photoIndex },
    );
    return [
      { kind: "title", text: post.title },
      ...bodySteps,
      { kind: "hashtags", text: composeHashtags(post) },
    ];
  }, [post]);

  const step = steps[stepIndex];

  async function copyText(text: string) {
    setCopyError(null);
    try {
      await Clipboard.write({ string: text });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const message = "복사에 실패했습니다. 텍스트를 길게 눌러 직접 복사해주세요.";
      setCopyError(message);
      window.alert(message);
    }
  }

  function goNext() {
    setCopied(false);
    setCopyError(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goPrev() {
    setCopied(false);
    setCopyError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  if (mode === "full") {
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
          <button className="primary-btn" onClick={() => copyText(fullText)}>
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
          <button className="ghost-btn" onClick={() => setMode("guided")}>
            단계별 모드로 보기
          </button>
        </div>
        <div className="actions">
          <button className="ghost-btn" onClick={onBack}>
            새 포스팅 만들기
          </button>
        </div>
      </div>
    );
  }

  const photo = step.kind === "photo" ? images[step.photoIndex - 1] : undefined;

  return (
    <div className="view">
      <h2>완성된 포스팅</h2>
      <p className="hint">
        단계 {stepIndex + 1} / {steps.length} — 순서대로 복사하고, 네이버 에디터에 바로
        붙여넣으면서 진행하세요.
      </p>

      {step.kind !== "photo" && (
        <div className="field">
          <span>
            {step.kind === "title" && "제목 (복사해서 붙여넣으세요)"}
            {step.kind === "text" && "이 부분을 복사해서 붙여넣으세요"}
            {step.kind === "hashtags" && "해시태그 (복사해서 붙여넣으세요)"}
          </span>
          <pre className="result-box result-body">{step.text}</pre>
          <div className="actions">
            <button className="primary-btn" onClick={() => copyText(step.text)}>
              {copied ? "복사됨 ✓" : "이 텍스트 복사하기"}
            </button>
          </div>
        </div>
      )}

      {step.kind === "photo" && (
        <div className="field">
          <span>사진 {step.photoIndex}번을 여기에 추가하세요</span>
          {photo ? (
            <div className="thumb-grid">
              <div className="thumb thumb-result">
                <img src={photo.dataUrl} alt={photo.fileName} />
                <span className="thumb-index">{step.photoIndex}</span>
                <button type="button" className="thumb-save" onClick={() => shareImage(photo)}>
                  저장
                </button>
              </div>
            </div>
          ) : (
            <p className="error">이 번호에 해당하는 사진을 찾을 수 없습니다.</p>
          )}
          <p className="hint">
            "저장"으로 사진을 기기에 내려받은 뒤, 네이버 에디터에서 방금 붙여넣은 텍스트 다음
            위치에 이 사진을 추가하세요.
          </p>
        </div>
      )}

      {copyError && <p className="error">{copyError}</p>}

      <div className="actions">
        <button className="ghost-btn" onClick={goPrev} disabled={stepIndex === 0}>
          이전
        </button>
        {stepIndex < steps.length - 1 ? (
          <button className="primary-btn" onClick={goNext}>
            다음
          </button>
        ) : (
          <button className="primary-btn" onClick={onBack}>
            완료 · 새 포스팅 만들기
          </button>
        )}
      </div>

      <div className="actions">
        <button className="ghost-btn" onClick={() => setMode("full")}>
          전체 한 번에 복사하기 (직접 사진 위치 맞추기)
        </button>
      </div>
    </div>
  );
}
