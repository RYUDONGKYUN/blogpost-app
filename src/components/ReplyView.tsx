import { useState } from "react";
import { Clipboard } from "@capacitor/clipboard";
import type { Settings } from "../types";
import { generateReply } from "../gemini";

interface Props {
  settings: Settings;
}

export default function ReplyView({ settings }: Props) {
  const [postLink, setPostLink] = useState("");
  const [postContext, setPostContext] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setError(null);
    setCopied(false);
    setBusy(true);
    try {
      const result = await generateReply(settings, { postLink, postContext, comment });
      setReply(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "답변 생성에 실패했습니다.";
      setError(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!reply) return;
    try {
      await Clipboard.write({ string: reply });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.alert("복사에 실패했습니다. 텍스트를 길게 눌러 직접 복사해주세요.");
    }
  }

  return (
    <div className="view">
      <h2>댓글 대댓글 작성</h2>

      <label className="field">
        <span>포스팅 링크 (선택)</span>
        <input
          type="url"
          value={postLink}
          onChange={(e) => setPostLink(e.target.value)}
          placeholder="예: https://blog.naver.com/..."
        />
        <p className="hint">
          가능하면 AI가 원문 내용을 참고해서 답변을 써요. 안 되더라도 아래 댓글 내용만으로
          자연스러운 답글을 만들어드립니다.
        </p>
      </label>

      <label className="field">
        <span>포스팅 내용 참고 (선택)</span>
        <textarea
          value={postContext}
          onChange={(e) => setPostContext(e.target.value)}
          rows={2}
          placeholder="이 포스팅이 어떤 내용인지 한두 줄 적어주면 답변이 더 정확해져요"
        />
      </label>

      <label className="field">
        <span>댓글 내용</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="독자가 남긴 댓글을 그대로 붙여넣으세요"
        />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button
          className="primary-btn"
          onClick={handleGenerate}
          disabled={busy || !comment.trim()}
        >
          {busy ? (
            <>
              <span className="spinner" /> 답변 작성 중...
            </>
          ) : (
            "대댓글 작성하기"
          )}
        </button>
      </div>

      {reply && (
        <div className="field">
          <span>생성된 답변</span>
          <pre className="result-box result-body">{reply}</pre>
          <div className="actions">
            <button className="primary-btn" onClick={handleCopy}>
              {copied ? "복사됨 ✓" : "답변 복사하기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
