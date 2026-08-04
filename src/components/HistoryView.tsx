import { useState } from "react";
import { Clipboard } from "@capacitor/clipboard";
import type { PostHistoryEntry } from "../types";
import { composeFullText } from "../postText";

interface Props {
  entries: PostHistoryEntry[];
  onBack: () => void;
}

export default function HistoryView({ entries, onBack }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleCopy(entry: PostHistoryEntry) {
    try {
      await Clipboard.write({ string: composeFullText(entry) });
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard permission issue on this device; user can still expand and copy manually
    }
  }

  return (
    <div className="view">
      <h2>작성 기록</h2>

      {entries.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-icon">🗒️</span>
          <p>아직 저장된 포스팅이 없습니다. 글을 생성하면 여기에 쌓여요.</p>
        </div>
      )}

      <div className="history-list">
        {entries.map((entry) => {
          const expanded = expandedId === entry.id;
          return (
            <div key={entry.id} className="history-card">
              <div
                className="history-summary"
                onClick={() => setExpandedId(expanded ? null : entry.id)}
              >
                {entry.thumbnail ? (
                  <img src={entry.thumbnail} className="history-thumb" alt="" />
                ) : (
                  <span className="history-thumb-placeholder">📝</span>
                )}
                <div className="history-info">
                  <span className="chip">{entry.category}</span>
                  <strong>{entry.title}</strong>
                  <span className="history-date">
                    {new Date(entry.createdAt).toLocaleString("ko-KR")}
                  </span>
                </div>
              </div>

              {expanded && (
                <>
                  <div className="field">
                    <span>키워드</span>
                    <div className="chip-row">
                      {entry.keywords.map((k) => (
                        <span key={k} className="chip">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                  <pre className="result-box result-body">{entry.body}</pre>
                </>
              )}

              <div className="actions">
                <button type="button" className="ghost-btn" onClick={() => handleCopy(entry)}>
                  {copiedId === entry.id ? "복사됨 ✓" : "전체 글 복사하기"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="actions">
        <button className="ghost-btn" onClick={onBack}>
          돌아가기
        </button>
      </div>
    </div>
  );
}
