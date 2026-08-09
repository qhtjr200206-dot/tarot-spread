// data/_requests/*.json 을 읽어 Gemini API를 호출하고, 결과를 data/_responses/*.json 에 쓴다.
// GEMINI_API_KEY는 GitHub Actions repo secret으로만 주입되며, 이 스크립트 밖으로 나가지 않는다.
import { readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { CARD_MEANINGS } from "./card-meanings.mjs";

const REQUESTS_DIR = "data/_requests";
const RESPONSES_DIR = "data/_responses";

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

function buildPrompt(spreadQuestion, characterContext, positions) {
  const lines = [
    "당신은 소설/극 속 등장인물을 타로로 분석하는 숙련된 리더입니다.",
    "일반적인 오늘의 운세(연애운, 금전운)가 아니라, 인물의 성격·심리·동기·관계 패턴·도덕적 그림자를 분석하는 것이 목적입니다.",
    `스프레드 질문: ${spreadQuestion}`,
  ];

  if (characterContext && (characterContext.name || characterContext.info || characterContext.situation)) {
    lines.push("", "분석 대상 캐릭터 정보:");
    if (characterContext.name) lines.push(`- 이름: ${characterContext.name}`);
    if (characterContext.info) lines.push(`- 기본 정보: ${characterContext.info}`);
    if (characterContext.situation) lines.push(`- 현재 상황/맥락: ${characterContext.situation}`);
  }

  lines.push("", "자리별 카드 정보 (참고 의미를 반드시 이 인물의 맥락에 맞게 재해석할 것):");
  for (const p of positions) {
    const orientation = p.orientation === "reversed" ? "역방향" : "정방향";
    const ref = CARD_MEANINGS[p.card]?.[p.orientation === "reversed" ? "reversed" : "upright"];
    lines.push(`${p.order}번 자리 "${p.label}"(자리 의미: ${p.meaning}) — 카드: ${p.card} (${orientation})`);
    if (ref) {
      lines.push(`  참고 상징: ${ref.summary} [키워드: ${ref.keywords.join(", ")}]`);
    }
  }

  lines.push(
    "",
    "요청사항:",
    "1. 각 자리(order)마다, 그 자리의 의미·카드·참고 상징을 캐릭터 정보와 결합해 2~4문장의 한국어 해석(interpretation)을 작성하세요.",
    "2. 모든 자리를 종합한 3~5문장의 전체 총합 해석(overall)을 작성하세요.",
    "캐릭터 정보가 주어졌다면 그 인물에 특화된 해석을 작성하고, 없다면 카드와 자리 의미만으로 일반적인 인물 분석 해석을 작성하세요.",
    "과장되거나 근거 없는 단정 대신, 카드 상징과 자리 의미에 근거한 해석을 작성하세요."
  );

  return lines.join("\n");
}

async function callGemini(spreadQuestion, characterContext, positions) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(spreadQuestion, characterContext, positions) }] }],
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

async function main() {
  await mkdir(RESPONSES_DIR, { recursive: true });

  let requestFiles = [];
  try {
    requestFiles = (await readdir(REQUESTS_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    console.log("처리할 요청 디렉터리가 없습니다. 종료합니다.");
    return;
  }

  if (requestFiles.length === 0) {
    console.log("처리할 요청이 없습니다.");
    return;
  }

  for (const file of requestFiles) {
    const id = file.replace(/\.json$/, "");
    const requestPath = path.join(REQUESTS_DIR, file);
    const responsePath = path.join(RESPONSES_DIR, `${id}.json`);

    console.log(`처리 중: ${id}`);
    let request;
    try {
      request = JSON.parse(await readFile(requestPath, "utf-8"));
    } catch (err) {
      console.error(`요청 파일 파싱 실패 (${id}):`, err.message);
      await unlink(requestPath).catch(() => {});
      continue;
    }

    try {
      const result = await callGemini(request.spreadQuestion, request.characterContext, request.positions);
      await writeFile(responsePath, JSON.stringify(result, null, 2) + "\n", "utf-8");
      console.log(`완료: ${id}`);
    } catch (err) {
      console.error(`Gemini 호출 실패 (${id}):`, err.message);
      await writeFile(
        responsePath,
        JSON.stringify({ error: err.message }, null, 2) + "\n",
        "utf-8"
      );
    }

    await unlink(requestPath).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
