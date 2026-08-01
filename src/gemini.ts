import type {
  ClarificationTurn,
  ComposeInput,
  GenerateResult,
  PostHistoryEntry,
  Settings,
} from "./types";

/** Multi-image requests over a slow mobile connection can otherwise hang
 * indefinitely with no feedback; abort and surface a clear error instead.
 * Scales with photo count — a post with dozens of photos genuinely needs
 * longer than a base fixed timeout allows (e.g. 39 photos previously
 * timed out at a flat 60s). Floor bumped to a full 5 minutes for extra
 * safety margin even on small requests. */
const BASE_TIMEOUT_MS = 300_000;
const TIMEOUT_PER_PHOTO_MS = 4_000;
const MAX_TIMEOUT_MS = 600_000;

function computeTimeoutMs(photoCount: number): number {
  return Math.min(BASE_TIMEOUT_MS + photoCount * TIMEOUT_PER_PHOTO_MS, MAX_TIMEOUT_MS);
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["ready", "needs_info"] },
    question: { type: "STRING" },
    title: { type: "STRING" },
    keywords: { type: "ARRAY", items: { type: "STRING" } },
    body: { type: "STRING" },
  },
  // All fields required (left as "" / [] when unused) so the model can't drop
  // title/body/keywords on a "ready" response — that used to surface as a bare
  // "Gemini 응답 형식이 올바르지 않습니다" with no way to tell what went wrong.
  required: ["status", "question", "title", "keywords", "body"],
};

/** A malformed/incomplete generation is usually a one-off glitch, not a
 * persistent problem, so it's worth silently retrying before bothering the
 * user — unlike timeouts/network errors, which retrying won't fix any faster. */
const MAX_MALFORMED_RETRIES = 2;

/** Extracts a short "opening hook" from a generated body, used to steer future
 * generations away from repeating the same phrasing. */
function extractOpening(body: string): string {
  const firstLine = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^\[사진\d+\]$/.test(line));
  return (firstLine ?? "").slice(0, 80);
}

function buildHistorySection(history: PostHistoryEntry[]): string {
  if (history.length === 0) return "";
  const lines = history
    .map((h) => `- 제목: "${h.title}" / 도입부: "${extractOpening(h.body)}"`)
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
- 뒤에는 사람들이 클릭하고 싶어지는 친근하고 수다스러운 "주저리주저리" 느낌의 문구. 가게 상호명을 알고 있으면 이 부분에 자연스럽게 넣어도 좋음 (지어내지 말고 정확한 이름만).`;
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
- 과장되거나 근거 없는 효능/효과 주장은 하지 말 것.
- 본문 마지막 줄에 해시태그를 쓰지 마세요 (앱이 별도로 붙입니다).`;
  }
  if (category === "맛집") {
    return `사용자가 실제로 쓰는 템플릿 구조를 그대로 따라서 작성하세요. 아래에서 큰따옴표로 감싼 부분은 본문에 글자 그대로(따옴표 없이) 넣어야 하는 소제목/마커이고, → 뒤는 그 자리에 무엇을 쓸지 설명하는 지시사항이니 지시사항 문장 자체를 본문에 베끼지 마세요.

"0. 내돈내산 솔직후기 인증" → 이 소제목 아래에, 협찬/광고 없이 실제로 자기 돈 주고 방문한 솔직한 후기라는 것을 밝히는 캐주얼한 한 줄을 쓰세요.

"1. 가게된 이유" → 이 소제목 아래에, 이 가게를 가게 된 계기/이유를 1~2문단으로 친근하게 설명하세요.

"2. 가게 내외부사진" → 이 소제목 아래에, 사진들 중 가게 외관/내부/분위기를 보여주는 사진들을 골라 짧은 설명과 함께 [사진N] 마커를 배치하세요.

"5. 사진과 설명" → 이 소제목 아래에, 나머지 음식 사진들에 대해 하나씩 설명하며 [사진N] 마커를 배치하세요. (2번과 5번을 합쳐서 총 ${photoCount}장의 사진을 1번부터 ${photoCount}번까지 모두 한 번씩 사용)

"※메뉴판※" → 이 소제목 아래에, 사진이나 참고 정보에서 파악할 수 있는 메뉴/가격을 정리하세요. 정확히 안 보이면 가격은 생략하고 메뉴 이름 위주로만 쓰고, 확실하지 않은 가격은 절대 지어내지 마세요.

"[운영시간정보]" → 이 마커를 독립된 줄에 그대로 한 번 넣으세요 (앱이 실제 운영시간 박스로 치환합니다). 앞뒤로 다른 텍스트를 붙이지 마세요.

"[지도정보]" → 이 마커를 독립된 줄에 그대로 한 번 넣으세요 (앱이 실제 지도/주소 박스로 치환합니다). 이 마커 바로 다음 줄에 주차 관련 팁을 한 문장 쓰되, "위에서 확인하세요"처럼 다른 섹션을 가리키는 표현 없이 그 문장 자체로 뜻이 통하게 쓰세요 (예: "주차는 가게 앞 공영주차장을 이용하면 편해요"). 주차 정보를 전혀 알 수 없으면 지어내지 말고 "주차는 미리 확인해보고 가시는 걸 추천드려요" 정도로 무난하게 쓰세요.

"7. 총평" → 이 소제목 아래에 아래 순서로 쓰세요:
  1) "오늘의 총평! 재방문의사 있음~~" 또는 "오늘의 총평! 재방문의사 없음~~" 처럼, 실제 후기 내용과 일치하는 재방문 의향을 캐주얼하게 밝히는 한 줄.
  2) 왜 그렇게 느꼈는지 2~3줄로 편하게 설명 (다른 곳과 비교하는 등 자연스러운 비유, "~~"나 "ㅎㅎ" 같은 말투를 섞어도 좋음).
  3) 빈 줄 하나, 그 다음 "오늘의 레고블럭 N개~~" 한 줄. N은 위 총평 내용과 반드시 일치해야 함: 1개=재방문 의사 없음/아쉬움 많음, 2개=평범함, 3개=만족스러움/재방문 가능, 4개=대만족/추천, 4.5개=거의 완벽, 5개=인생 맛집. (4.5 외에는 소수점 쓰지 말 것)
  4) 바로 다음 줄부터 "사진 설명을 입력하세요." 라는 줄을 N을 반올림한 정수 횟수만큼 한 줄씩 반복해서 넣기 (예: 레고블럭 3개면 3줄, 4.5개면 5줄).

위 순서(0→1→2→5→메뉴판→운영시간정보→지도정보→7)를 그대로 지키고, 번호가 0,1,2,5,7로 중간에 비는 것도 의도된 것이니 3,4,6은 만들지 마세요.

[공통 규칙]
- 실제 방문/경험 후기처럼 친근하고 편안한 구어체 반말 섞인 존댓말로 작성 (예: "~했어요", "~하더라구요").
- 이모지를 적당히 섞어서 가독성 있게.
- 각 섹션 사이는 빈 줄로 구분해서 네이버 블로그 에디터에 바로 붙여넣기 좋게.
- 과장되거나 근거 없는 효능/효과/가격 주장은 하지 말 것.
- 운영시간/주소/지도링크를 마커 대신 직접 텍스트로 쓰지 마세요. 반드시 [운영시간정보], [지도정보] 마커로만 표시하세요.
- "총평" 섹션 뒤에는 그 외 다른 내용을 절대 추가하지 마세요 (평점 기준표는 앱이 자동으로 붙입니다). 본문 마지막 줄에 해시태그도 쓰지 마세요 (앱이 별도로 붙입니다).`;
  }
  return `- 실제 방문/경험 후기처럼 친근하고 편안한 구어체 반말 섞인 존댓말로 작성 (예: "~했어요", "~하더라구요").
- 이모지를 적당히 섞어서 가독성 있게.
- 문단 사이는 빈 줄로 구분해서 네이버 블로그 에디터에 바로 붙여넣기 좋게.
- 사진을 삽입할 위치마다 정확히 "[사진1]", "[사진2]" 형식의 마커를 독립된 줄에 넣기 (총 ${photoCount}장, 1번부터 ${photoCount}번까지 모두 한 번씩 사용, 자연스러운 위치에 분산 배치).
- 과장되거나 근거 없는 효능/효과 주장은 하지 말 것.
- 본문 마지막 줄에 해시태그를 쓰지 마세요 (앱이 별도로 붙입니다).`;
}

const LEGO_RATING_LEGEND = `1개 : 재방문 의사 없음. 여러모로 아쉬움이 많이 남았던 곳.
2개 : 평범한 곳. 근처에 갈 일이 있다면 한 번쯤 고려해 볼 만함.
3개 : 맛있고 만족스러움! 동네를 다시 방문한다면 갈만한 곳
4개 : 대만족! 멀리서도 찾아올 가치가 있는 찐 추천 맛집.
4.5개 : ✨ 내 기준 최고 만점 ✨ 와인에 100점이 없듯이, 완벽에 가까운 역대급 인생 맛집!
5개 : 살면서 만날 수 있는 곳이겠지?`;

/** Replaces the [운영시간정보]/[지도정보] markers the model is instructed to leave in
 * the body with 인용구-style boxes built from user-entered facts only (never
 * AI-generated), so business hours / map links can't be hallucinated or garbled.
 * Markers with no corresponding data are removed entirely rather than left empty. */
function insertDeterministicBoxes(body: string, input: ComposeInput): string {
  let result = body;

  if (input.hours.trim()) {
    const sourceLine = input.mapLink.trim() ? "(출처: 네이버지도)" : "(출처: 직접 확인)";
    const hoursLines = input.hours
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const box = `※운영시간※\n🕐 ${hoursLines.join("\n")}\n${sourceLine}`;
    result = result.replace(/\[운영시간정보\]/g, box);
  } else {
    result = result.replace(/[ \t]*\[운영시간정보\][ \t]*\n?/g, "");
  }

  if (input.businessName.trim() || input.place.trim() || input.mapLink.trim()) {
    const lines = ["※지도와 주차팁※"];
    if (input.businessName.trim()) lines.push(`🏪 ${input.businessName.trim()}`);
    if (input.place.trim()) lines.push(`📍 ${input.place.trim()}`);
    if (input.mapLink.trim()) lines.push(`🔗 네이버지도 : ${input.mapLink.trim()}`);
    result = result.replace(/\[지도정보\]/g, lines.join("\n"));
  } else {
    result = result.replace(/[ \t]*\[지도정보\][ \t]*\n?/g, "");
  }

  // collapse blank-line runs left behind by removed markers
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function buildClarificationSection(qa: ClarificationTurn[]): string {
  if (qa.length === 0) return "";
  const lines = qa.map((turn) => `- Q: ${turn.question}\n  A: ${turn.answer}`).join("\n");
  return `\n[이미 확인한 추가 정보]
이전에 부족한 정보를 사용자에게 질문했고, 아래처럼 답변받았습니다. 이 내용을 반영해서 이번에는 반드시 완성된 포스팅(status: "ready")으로 작성하세요:
${lines}
`;
}

function buildPrompt(
  input: ComposeInput,
  history: PostHistoryEntry[],
  qaHistory: ClarificationTurn[],
): string {
  const isRecipe = input.category === "레시피";
  const placeLine = input.place.trim()
    ? `${isRecipe ? "요리 이름" : "장소/지역명"}: ${input.place.trim()}`
    : `${isRecipe ? "요리 이름" : "장소/지역명"}: (알 수 없음 - 사진을 보고 자연스럽게 유추)`;
  const businessNameLine = input.businessName.trim()
    ? `가게 상호명(정확한 이름, 반드시 이 표기 그대로 사용하고 다른 이름을 지어내지 말 것): ${input.businessName.trim()}`
    : "";
  const notesLine = input.notes.trim()
    ? `참고할 추가 정보(사용자가 직접 입력): ${input.notes.trim()}`
    : "";
  const photoCount = input.images.length;

  return `당신은 네이버 블로그에서 활동하는 인기 파워블로거입니다.
사용자가 업로드한 사진 ${photoCount}장을 보고, 그 사진들에 어울리는 "${input.category}" 카테고리의 블로그 포스팅을 작성하세요.

${placeLine}
${businessNameLine}
${notesLine}
${buildHistorySection(history)}
${buildClarificationSection(qaHistory)}

[status 필드]
- 사진과 위 정보만으로 충분히 좋은 포스팅을 쓸 수 있으면 status="ready"로 하고 title/keywords/body를 모두 채우세요. 대부분의 경우 이렇게 하세요.
- 정말로 핵심 정보가 없어서 그럴듯하게 추측하면 내용이 부정확해질 것 같을 때만 (예: 사진만으로는 요리/가게 이름을 전혀 알 수 없거나, 사용자가 언급했지만 사진에 안 보이는 중요한 대상이 있을 때) status="needs_info"로 하고, question 필드에 사용자에게 물어볼 질문을 하나만 한국어로 작성하세요. 이때 title/keywords/body는 비워두세요.
- 애매하면 무리하게 질문하지 말고 사진에서 보이는 대로 자연스럽게 추측해서 "ready"로 작성하는 것을 우선하세요. 질문은 정말 필요할 때만 최소한으로.

[제목 규칙] (status="ready"일 때)
${buildTitleRule(input)}

[본문 규칙] (status="ready"일 때)
${buildBodyRule(photoCount, input.category)}

[keywords 필드] (status="ready"일 때)
- 본문과 별개로, 검색에 유리한 키워드 12~18개를 배열로 제공 (해시태그 # 기호 없이 단어만).
- 이 포스팅 내용과 실제로 어울리는 키워드만 쓰고, 억지로 개수를 채우기 위한 무관한 단어는 넣지 마세요.
- 다양한 각도로 섞어서 구성: 지역/장소명 조합(예: 지역+카테고리, 지역+구체적 메뉴/활동), 가게 상호명이나 요리/활동 이름 자체, 좀 더 넓은 범주 키워드, 분위기나 상황을 나타내는 키워드 등을 골고루 포함.

JSON 스키마에 맞춰 status, question, title, keywords, body 필드로 응답하세요.`;
}

/** Thrown when the request succeeded but the model's JSON came back
 * incomplete/malformed — worth a silent retry rather than failing outright. */
class MalformedResponseError extends Error {}

/** Thrown when the configured model name 404s — usually a stale/hardcoded
 * default that Google has since renamed or retired for this key. */
class ModelNotFoundError extends Error {
  model: string;
  constructor(model: string, message: string) {
    super(message);
    this.model = model;
  }
}

/** Picks a stand-in model when the configured one 404s, preferring a
 * "flash" model (fast/cheap, matches the app's default) over whatever else
 * this key has access to. */
async function pickFallbackModel(apiKey: string, badModel: string): Promise<string> {
  const models = await listAvailableModels(apiKey);
  const usable = models.filter((m) => m !== badModel);
  if (usable.length === 0) {
    throw new Error(
      "이 API 키로 사용 가능한 Gemini 모델을 찾지 못했습니다. 설정 화면에서 키가 올바른지 확인해주세요.",
    );
  }
  return (
    usable.find((m) => /flash/i.test(m) && !/flash-lite/i.test(m)) ??
    usable.find((m) => /flash/i.test(m)) ??
    usable[0]
  );
}

export async function generatePost(
  settings: Settings,
  input: ComposeInput,
  history: PostHistoryEntry[] = [],
  qaHistory: ClarificationTurn[] = [],
): Promise<GenerateResult> {
  if (!settings.apiKey.trim()) {
    throw new Error("설정 화면에서 Gemini API 키를 먼저 입력해주세요.");
  }
  if (input.images.length === 0) {
    throw new Error("사진을 1장 이상 업로드해주세요.");
  }

  let effectiveSettings = settings;
  let modelFallbackTried = false;

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await requestOnce(effectiveSettings, input, history, qaHistory);
      return effectiveSettings.model !== settings.model
        ? { ...result, resolvedModel: effectiveSettings.model }
        : result;
    } catch (e) {
      if (e instanceof ModelNotFoundError && !modelFallbackTried) {
        modelFallbackTried = true;
        const fallbackModel = await pickFallbackModel(settings.apiKey, e.model);
        effectiveSettings = { ...settings, model: fallbackModel };
        continue;
      }
      if (e instanceof ModelNotFoundError) {
        throw new Error(e.message);
      }
      if (e instanceof MalformedResponseError && attempt < MAX_MALFORMED_RETRIES) {
        continue;
      }
      if (e instanceof MalformedResponseError) {
        throw new Error(
          `${e.message} (${MAX_MALFORMED_RETRIES + 1}번 시도 모두 실패했습니다. 다시 시도해주세요.)`,
        );
      }
      throw e;
    }
  }
}

async function requestOnce(
  settings: Settings,
  input: ComposeInput,
  history: PostHistoryEntry[],
  qaHistory: ClarificationTurn[],
): Promise<GenerateResult> {
  const parts: unknown[] = [{ text: buildPrompt(input, history, qaHistory) }];
  for (const img of input.images) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    settings.model,
  )}:generateContent`;

  const timeoutMs = computeTimeoutMs(input.images.length);
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
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.9,
          // Leaves headroom for a full multi-section post (title/body/keywords all
          // in one JSON blob) so a long 맛집 template doesn't get cut off mid-response.
          maxOutputTokens: 8192,
        },
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(
        `요청이 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않아 중단했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.`,
      );
    }
    throw new Error(
      "Gemini 서버에 연결하지 못했습니다 (failed to fetch). Wi-Fi/데이터 연결 상태를 확인하고 다시 시도해주세요.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new ModelNotFoundError(
        settings.model,
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
      throw new MalformedResponseError(
        "Gemini 응답이 길이 제한으로 중간에 잘렸습니다.",
      );
    }
    throw new MalformedResponseError("Gemini 응답에서 결과 텍스트를 찾을 수 없습니다.");
  }

  let parsed: {
    status?: string;
    question?: string;
    title?: string;
    keywords?: string[];
    body?: string;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MalformedResponseError("Gemini 응답을 해석할 수 없습니다 (JSON 파싱 실패).");
  }

  if (parsed.status === "needs_info") {
    if (!parsed.question?.trim()) {
      throw new MalformedResponseError(
        "Gemini가 추가 질문을 하려 했지만 질문 내용이 비어 있습니다.",
      );
    }
    return { status: "needs_info", question: parsed.question.trim() };
  }

  if (!parsed.title?.trim() || !parsed.body?.trim() || !Array.isArray(parsed.keywords) || parsed.keywords.length === 0) {
    throw new MalformedResponseError("Gemini 응답 형식이 올바르지 않습니다.");
  }

  let body = parsed.body;
  if (input.category === "맛집") {
    body = `${insertDeterministicBoxes(body, input)}\n\n${LEGO_RATING_LEGEND}`;
  }

  return {
    status: "ready",
    post: { title: parsed.title, keywords: parsed.keywords, body },
  };
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
