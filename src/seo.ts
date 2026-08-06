import { buildHistorySection } from "./gemini";
import type {
  GeneratedPost,
  PostHistoryEntry,
  SeoKeywordResult,
  SeoOutline,
  SeoTopicInput,
  Settings,
} from "./types";

/** Shared voice/persona instruction for every SEO-flow prompt, so keyword
 * research, structure design, and the final body all read consistently —
 * a friendly expert sharing know-how, not a stiff encyclopedia entry. */
const PERSONA = `당신은 10년 차 네이버 블로그 인플루언서이자 이 주제를 직접 경험해본 전문가입니다.
백과사전처럼 딱딱하게 설명하지 말고, 친한 후배에게 노하우를 알려주듯 편안하고 생생한 말투로 쓰세요.
"~입니다/~습니다"만 반복하는 문어체는 피하고, "~하더라구요", "~해보니까", "~하실 거예요"처럼 구어체와 존댓말을 자연스럽게 섞고, 이모지와 감탄사("사실", "근데", "저도 처음엔")를 적절히 곁들여 생동감을 주세요.`;

class SeoRequestError extends Error {}

async function callGemini(
  settings: Settings,
  prompt: string,
  schema: unknown,
  maxOutputTokens: number,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  if (!settings.apiKey.trim()) {
    throw new Error("설정 화면에서 Gemini API 키를 먼저 입력해주세요.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    settings.model,
  )}:generateContent`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": settings.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.9,
          maxOutputTokens,
        },
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(
        `요청이 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않아 중단했습니다. 다시 시도해주세요.`,
      );
    }
    throw new Error(
      "Gemini 서버에 연결하지 못했습니다. Wi-Fi/데이터 연결 상태를 확인하고 다시 시도해주세요.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new Error(
        `모델 "${settings.model}"을(를) 찾을 수 없습니다. 설정 화면에서 "사용 가능한 모델 불러오기"로 현재 키가 지원하는 모델을 다시 선택해주세요.`,
      );
    }
    throw new Error(`Gemini API 오류 (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const finishReason: string | undefined = data?.candidates?.[0]?.finishReason;
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    if (finishReason === "MAX_TOKENS") {
      throw new SeoRequestError("Gemini 응답이 길이 제한으로 중간에 잘렸습니다. 다시 시도해주세요.");
    }
    throw new SeoRequestError("Gemini 응답에서 결과 텍스트를 찾을 수 없습니다.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new SeoRequestError("Gemini 응답을 해석할 수 없습니다 (JSON 파싱 실패). 다시 시도해주세요.");
  }
}

const KEYWORD_SCHEMA = {
  type: "OBJECT",
  properties: {
    subKeywords: { type: "ARRAY", items: { type: "STRING" } },
    relatedKeywords: { type: "ARRAY", items: { type: "STRING" } },
    titleCandidates: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["subKeywords", "relatedKeywords", "titleCandidates"],
};

export async function findKeywords(
  settings: Settings,
  input: SeoTopicInput,
  history: PostHistoryEntry[] = [],
): Promise<SeoKeywordResult> {
  if (!input.topic.trim()) {
    throw new Error("주제를 입력해주세요.");
  }

  const prompt = `${PERSONA}

지금은 글을 쓰기 전 "키워드 리서치" 단계입니다. 아래 주제로 네이버 블로그 SEO에 유리한 키워드를 찾아주세요.

주제: ${input.topic.trim()}
글의 목적·분위기: ${input.purpose}
${buildHistorySection(history)}

[subKeywords] (5개)
주제를 구체화하는 서브 키워드. "주제+세부 행동/상황" 조합처럼 검색량이 있을 법한 조합으로.

[relatedKeywords] (5개)
사람들이 이 주제와 함께 궁금해할 연관 키워드. 너무 뻔하지 않게 다양한 각도로.

[titleCandidates] (3개)
실제로 클릭하고 싶어지는 블로그 제목 후보. 서로 다른 각도(정보형/후기형/숫자형 등)로 다양하게 작성하고, 절대 서로 비슷한 문장 구조를 반복하지 마세요. 과장된 클릭베이트나 근거 없는 수치는 쓰지 마세요.

JSON 스키마에 맞춰 subKeywords, relatedKeywords, titleCandidates 필드로 응답하세요.`;

  const parsed = await callGemini(settings, prompt, KEYWORD_SCHEMA, 2048, 60_000);
  const subKeywords = Array.isArray(parsed.subKeywords) ? parsed.subKeywords.map(String) : [];
  const relatedKeywords = Array.isArray(parsed.relatedKeywords)
    ? parsed.relatedKeywords.map(String)
    : [];
  const titleCandidates = Array.isArray(parsed.titleCandidates)
    ? parsed.titleCandidates.map(String)
    : [];

  if (subKeywords.length === 0 || relatedKeywords.length === 0 || titleCandidates.length === 0) {
    throw new SeoRequestError("Gemini 응답 형식이 올바르지 않습니다.");
  }

  return { subKeywords, relatedKeywords, titleCandidates };
}

const OUTLINE_SCHEMA = {
  type: "OBJECT",
  properties: {
    estimatedLength: { type: "NUMBER" },
    sections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          heading: { type: "STRING" },
          bullets: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["heading", "bullets"],
      },
    },
  },
  required: ["estimatedLength", "sections"],
};

export async function designOutline(
  settings: Settings,
  input: SeoTopicInput,
  selectedTitle: string,
  selectedKeywords: string[],
): Promise<SeoOutline> {
  const prompt = `${PERSONA}

지금은 "글 구조 설계" 단계입니다. 아래 확정된 제목과 키워드를 바탕으로 SEO에 유리한 소제목(H2) 구조를 설계하세요.

주제: ${input.topic.trim()}
글의 목적·분위기: ${input.purpose}
확정된 제목: ${selectedTitle}
반영할 키워드: ${selectedKeywords.join(", ")}

[sections] (4~6개)
- 글을 처음부터 끝까지 자연스럽게 읽히게 만드는 H2 소제목들을 순서대로 설계하세요 (도입부 → 핵심 정보/노하우 여러 개 → 마무리 순서 권장).
- 각 소제목은 "~하는 이유", "~할 때 주의할 점"처럼 궁금증을 유발하는 자연스러운 문구로.
- 각 소제목 아래 bullets에는 그 섹션에서 실제로 다룰 핵심 포인트를 1~3개 짧게 요약.

[estimatedLength]
완성됐을 때 예상 글자수 (숫자만, 보통 1500~3000 사이).

JSON 스키마에 맞춰 estimatedLength, sections 필드로 응답하세요.`;

  const parsed = await callGemini(settings, prompt, OUTLINE_SCHEMA, 2048, 60_000);
  const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections = rawSections
    .map((s) => {
      if (typeof s !== "object" || s === null) return null;
      const obj = s as Record<string, unknown>;
      const heading = typeof obj.heading === "string" ? obj.heading : "";
      const bullets = Array.isArray(obj.bullets) ? obj.bullets.map(String) : [];
      return heading ? { heading, bullets } : null;
    })
    .filter((s): s is { heading: string; bullets: string[] } => s !== null);

  const estimatedLength = Number(parsed.estimatedLength) || 0;

  if (sections.length === 0 || estimatedLength <= 0) {
    throw new SeoRequestError("Gemini 응답 형식이 올바르지 않습니다.");
  }

  return { estimatedLength, sections };
}

const CONTENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    body: { type: "STRING" },
  },
  required: ["body"],
};

/** Second pass over an already-structured draft: smooths out the
 * mechanical, AI-ish phrasing that survives even with a persona in the
 * first prompt (structure/keyword/length constraints tend to pull the
 * model back toward formulaic sentences). Keeps headings, facts, keywords,
 * and length intact — only touches phrasing and sentence rhythm. */
async function humanizeBody(settings: Settings, draft: string): Promise<string> {
  const prompt = `당신은 AI가 쓴 초안을 사람이 쓴 것처럼 자연스럽게 다듬는 편집자입니다.
아래 초안은 구조(소제목)와 키워드 요구사항에 맞춰 AI가 작성해서, 문장이 다소 기계적이거나 매 문단이 비슷한 패턴으로 반복될 수 있습니다.

[다듬는 기준]
- 문장 길이에 리듬을 주세요 — 짧은 문장과 긴 문장을 섞고, 문단마다 시작하는 방식을 다르게 하세요.
- "~습니다/~해요"만 기계적으로 반복하지 말고 어미를 자연스럽게 섞어 쓰세요.
- "~라고 할 수 있습니다", "매우 중요합니다", "~하는 것이 좋습니다" 같은 AI 특유의 설명체 문구를, 실제 사람이 편하게 말하듯 자연스러운 표현으로 바꾸세요.
- 소제목, 핵심 정보, 키워드, 문단 순서, 전체 분량은 그대로 유지하세요 — 표현과 문장 리듬만 사람처럼 다듬는 것이 목표입니다.
- 이모지는 과하지 않게 원래 있던 수준으로 유지하세요.

[초안]
${draft}

JSON 스키마에 맞춰 body 필드로, 다듬은 최종 본문 전체를 출력하세요.`;

  const parsed = await callGemini(settings, prompt, CONTENT_SCHEMA, 8192, 120_000);
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  // A humanize pass that comes back empty/malformed shouldn't sink the
  // whole generation — fall back to the perfectly usable structured draft.
  return body || draft;
}

export async function generateSeoContent(
  settings: Settings,
  input: SeoTopicInput,
  outline: SeoOutline,
  selectedTitle: string,
  selectedKeywords: string[],
  history: PostHistoryEntry[] = [],
  onStage?: (stage: "draft" | "polish") => void,
): Promise<GeneratedPost> {
  const outlineText = outline.sections
    .map((s, i) => `${i + 1}. ${s.heading}\n${s.bullets.map((b) => `   - ${b}`).join("\n")}`)
    .join("\n\n");

  const prompt = `${PERSONA}

지금은 "본문 작성" 단계입니다. 아래 확정된 제목/구조/키워드를 그대로 따라 완성된 블로그 본문을 작성하세요.

주제: ${input.topic.trim()}
글의 목적·분위기: ${input.purpose}
확정된 제목: ${selectedTitle}
목표 분량: 약 ${outline.estimatedLength}자
반영할 키워드(자연스럽게 녹여쓸 것, 억지로 나열하지 말 것): ${selectedKeywords.join(", ")}

[글 구조 — 아래 소제목과 순서를 그대로 따를 것]
${outlineText}
${buildHistorySection(history)}

[작성 규칙]
- 위 소제목들을 본문에 그대로(문구를 바꾸지 말고) 순서대로 사용하고, 각 소제목 아래에 해당 bullet 포인트들을 자연스러운 문장으로 풀어서 설명하세요.
- 각 소제목 앞에는 빈 줄을 넣어 구분하세요.
- 실제 경험/노하우를 아는 사람이 알려주는 것처럼 구체적으로 쓰고, 막연한 일반론은 피하세요.
- 과장되거나 근거 없는 효과/수치 주장은 하지 마세요.
- 마지막에는 짧은 마무리 인사와 함께 자연스러운 행동 유도(댓글/공감 등)로 끝내세요.
- 본문 마지막 줄에 해시태그는 쓰지 마세요 (앱이 별도로 붙입니다).

JSON 스키마에 맞춰 body 필드로 응답하세요.`;

  onStage?.("draft");
  const parsed = await callGemini(settings, prompt, CONTENT_SCHEMA, 8192, 180_000);
  const draft = typeof parsed.body === "string" ? parsed.body.trim() : "";
  if (!draft) {
    throw new SeoRequestError("Gemini 응답 형식이 올바르지 않습니다.");
  }

  onStage?.("polish");
  const body = await humanizeBody(settings, draft);

  return { title: selectedTitle, keywords: selectedKeywords, body };
}
