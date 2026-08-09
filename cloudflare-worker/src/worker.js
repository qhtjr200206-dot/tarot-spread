// Gemini API 프록시. GEMINI_API_KEY는 여기(Cloudflare Worker 환경변수)에서만 사용되고
// 클라이언트(GitHub Pages)에는 절대 전달되지 않는다.
//
// 필요한 환경변수/시크릿 (wrangler secret put 로 등록):
//   GEMINI_API_KEY      - Google AI Studio에서 발급한 Gemini API 키
//   ADMIN_SHARED_SECRET - 관리자 화면(config.js의 workerSharedSecret)과 동일한 값
// wrangler.toml [vars] 로 설정하는 값:
//   ALLOWED_ORIGIN - GitHub Pages 배포 주소 (예: https://username.github.io)
//   GEMINI_MODEL    - 사용할 Gemini 모델 (기본값 gemini-2.0-flash)

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
    "Access-Control-Max-Age": "86400",
  };
}

function buildPrompt(spreadQuestion, positions) {
  const positionLines = positions
    .map((p) => `${p.order}번 자리 "${p.label}"(의미: ${p.meaning}) — 뽑힌 카드: ${p.card}`)
    .join("\n");

  return [
    "당신은 숙련된 타로 리더입니다. 아래 스프레드의 질문과 각 자리에 뽑힌 카드를 바탕으로 해석을 작성하세요.",
    `스프레드 질문: ${spreadQuestion}`,
    "자리별 정보:",
    positionLines,
    "",
    "요청사항:",
    "1. 각 자리(order)마다 그 자리의 의미와 뽑힌 카드를 결합한 2~4문장의 한국어 해석(interpretation)을 작성하세요.",
    "2. 모든 자리를 종합한 3~5문장의 전체 총합 해석(overall)을 작성하세요.",
    "과장되거나 근거 없는 단정 대신, 카드 상징과 자리 의미에 근거한 해석을 작성하세요.",
  ].join("\n");
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    positions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          order: { type: "INTEGER" },
          interpretation: { type: "STRING" },
        },
        required: ["order", "interpretation"],
      },
    },
    overall: { type: "STRING" },
  },
  required: ["positions", "overall"],
};

async function callGemini(env, spreadQuestion, positions) {
  const model = env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(spreadQuestion, positions) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API 오류 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 응답에서 텍스트를 찾을 수 없습니다.");
  return JSON.parse(text);
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    if (url.pathname !== "/api/interpret" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers: corsHeaders(allowedOrigin) });
    }

    if (request.headers.get("X-Admin-Secret") !== env.ADMIN_SHARED_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
      });
    }

    const { spreadQuestion, positions } = body;
    if (!spreadQuestion || !Array.isArray(positions) || positions.length === 0) {
      return new Response(JSON.stringify({ error: "spreadQuestion, positions가 필요합니다." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
      });
    }

    try {
      const result = await callGemini(env, spreadQuestion, positions);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err.message || err) }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
      });
    }
  },
};
