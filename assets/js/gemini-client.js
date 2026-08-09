// Cloudflare Worker(Gemini 프록시)를 호출하는 클라이언트.
// Gemini API 키는 절대 이 파일이나 어떤 클라이언트 코드에도 두지 않는다 — Worker 안에서만 사용된다.

async function requestAiInterpretation({ spreadQuestion, positions }) {
  const res = await fetch(SITE_CONFIG.geminiWorkerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": SITE_CONFIG.workerSharedSecret,
    },
    body: JSON.stringify({ spreadQuestion, positions }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI 해석 요청 실패 (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.positions) || typeof data.overall !== "string") {
    throw new Error("AI 응답 형식이 올바르지 않습니다.");
  }
  return data;
}
