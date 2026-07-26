import type { ComposeInput, GeneratedPost, PostHistoryEntry, Settings } from "./types";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    keywords: { type: "ARRAY", items: { type: "STRING" } },
    body: { type: "STRING" },
  },
  required: ["title", "keywords", "body"],
};

/** Extracts a short "opening hook" from a generated body, for storing in history
 * so future prompts can be steered away from repeating the same phrasing. */
export function extractOpening(body: string): string {
  const firstLine = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^\[사진\d+\]$/.test(line));
  return (firstLine ?? "").slice(0, 80);
}

function buildHistorySection(history: PostHistoryEntry[]): string {
  if (history.length === 0) return "";
  const lines = history
    .map((h) => `- 제목: "${h.title}" / 도입부: "${h.opening}"`)
    .join("\n");
  return `\n[반복 회피]
아래는 최근에 이 카테고리로 작성했던 제목과 도입부입니다. 같은 어투/문장 구조/표현을 반복하지 말고, 톤(친근한 후기体)은 유지하되 전개 방식과 표현을 다르게 써주세요:
${lines}
`;
}

function buildTitleRule(input: ComposeInput): string {
  if (input.category === "레시피") {
    return `- 형식: "[요리 이름] 나머지 제목" 처럼 대괄호로 시작.
- 요리 이름을 안 알려줬으면 사진을 보고 요리 이름을 추정해서 넣기.
- 뒤에는 "만드는 법", "집밥 레시피" 같은 표현과 함께 사람들이 클릭하고 싶어지는 친근한 문구.`;
  }
  return `- 형식: "[지역/장소 ${input.category}] 나머지 제목" 처럼 대괄호로 시작.
- 지역명을 모르면 대괄호 안에 카테고리만 넣거나 사진 분위기에 맞는 짧은 수식어를 넣기.
- 뒤에는 사람들이 클릭하고 싶어지는 친근하고 수다스러운 "주저리주저리" 느낌의 문구.`;
}

function buildBodyRule(photoCount: number, category: ComposeInput["category"]): string {
  if (category === "레시피") {
    return `- 업로드된 사진 ${photoCount}장은 보통 "재료 → 만드는 과정 → 완성 요리" 순서로 찍혀 있습니다. 각 사진을 실제로 보고 재료 사진인지, 조리 과정 사진인지, 완성된 요리 사진인지 스스로 판단하세요.
- 본문 구성은 다음 순서를 따르세요:
  1) 이 요리를 소개하는 짧고 친근한 인사말 (왜 만들었는지, 얼마나 간단한지 등)
  2) "재료" 소제목 아래, 재료 사진들을 보고 파악한 재료를 목록으로 정리 (분량을 사진만으로 알 수 없으면 "적당량"처럼 자연스럽게 표기, 사용자가 알려준 추가 정보에 분량이 있으면 그것을 우선 사용). 관련 재료 사진의 [사진N] 마커도 이 근처에 배치.
  3) "만드는 순서" 소제목 아래, 번호를 매긴 단계별 설명을 조리 과정 사진 순서에 맞춰 작성하고, 각 단계 설명 바로 아래에 해당하는 과정 사진의 [사진N] 마커를 배치.
  4) 완성된 요리 사진의 [사진N] 마커와 함께 마무리 인사/맛 평가/먹는 팁.
- 실제 집에서 만들어본 것처럼 친근하고 편안한 구어체 반말 섞인 존댓말로 작성 (예: "~했어요", "~하더라구요").
- 이모지를 적당히 섞어서 가독성 있게.
- 문단 사이는 빈 줄로 구분해서 네이버 블로그 에디터에 바로 붙여넣기 좋게.
- 사진 마커는 정확히 "[사진1]", "[사진2]" 형식으로 독립된 줄에 넣고, 총 ${photoCount}장을 1번부터 ${photoCount}번까지 모두 한 번씩만 사용.
- 마지막 줄에는 해시태그 형식의 키워드 5~8개를 나열.
- 과장되거나 근거 없는 효능/효과 주장은 하지 말 것.`;
  }
  return `- 실제 방문/경험 후기처럼 친근하고 편안한 구어체 반말 섞인 존댓말로 작성 (예: "~했어요", "~하더라구요").
- 이모지를 적당히 섞어서 가독성 있게.
- 문단 사이는 빈 줄로 구분해서 네이버 블로그 에디터에 바로 붙여넣기 좋게.
- 사진을 삽입할 위치마다 정확히 "[사진1]", "[사진2]" 형식의 마커를 독립된 줄에 넣기 (총 ${photoCount}장, 1번부터 ${photoCount}번까지 모두 한 번씩 사용, 자연스러운 위치에 분산 배치).
- 마지막 줄에는 해시태그 형식의 키워드 5~8개를 나열.
- 과장되거나 근거 없는 효능/효과 주장은 하지 말 것.`;
}

function buildPrompt(input: ComposeInput, history: PostHistoryEntry[]): string {
  const isRecipe = input.category === "레시피";
  const placeLine = input.place.trim()
    ? `${isRecipe ? "요리 이름" : "장소/지역명"}: ${input.place.trim()}`
    : `${isRecipe ? "요리 이름" : "장소/지역명"}: (알 수 없음 - 사진을 보고 자연스럽게 유추)`;
  const notesLine = input.notes.trim()
    ? `참고할 추가 정보(사용자가 직접 입력): ${input.notes.trim()}`
    : "";
  const photoCount = input.images.length;

  return `당신은 네이버 블로그에서 활동하는 인기 파워블로거입니다.
사용자가 업로드한 사진 ${photoCount}장을 보고, 그 사진들에 어울리는 "${input.category}" 카테고리의 블로그 포스팅을 작성하세요.

${placeLine}
${notesLine}
${buildHistorySection(history)}

[제목 규칙]
${buildTitleRule(input)}

[본문 규칙]
${buildBodyRule(photoCount, input.category)}

[keywords 필드]
- 본문과 별개로, 검색에 유리한 키워드 5~8개를 배열로 제공 (해시태그 # 기호 없이 단어만).

JSON 스키마에 맞춰 title, keywords, body 세 필드로만 응답하세요.`;
}

export async function generatePost(
  settings: Settings,
  input: ComposeInput,
  history: PostHistoryEntry[] = [],
): Promise<GeneratedPost> {
  if (!settings.apiKey.trim()) {
    throw new Error("설정 화면에서 Gemini API 키를 먼저 입력해주세요.");
  }
  if (input.images.length === 0) {
    throw new Error("사진을 1장 이상 업로드해주세요.");
  }

  const parts: unknown[] = [{ text: buildPrompt(input, history) }];
  for (const img of input.images) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    settings.model,
  )}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.9,
      },
    }),
  });

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
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini 응답에서 결과 텍스트를 찾을 수 없습니다.");
  }

  const parsed = JSON.parse(text) as GeneratedPost;
  if (!parsed.title || !parsed.body || !Array.isArray(parsed.keywords)) {
    throw new Error("Gemini 응답 형식이 올바르지 않습니다.");
  }
  return parsed;
}

interface GeminiModelInfo {
  name: string;
  supportedGenerationMethods?: string[];
}

/** Queries the models this API key currently has access to, so the app never
 * relies on a hardcoded model name that Google can rename/retire later. */
export async function listAvailableModels(apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) {
    throw new Error("API 키를 먼저 입력해주세요.");
  }

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
    headers: { "x-goog-api-key": apiKey },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`모델 목록을 불러오지 못했습니다 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const models: GeminiModelInfo[] = data?.models ?? [];
  return models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
}
