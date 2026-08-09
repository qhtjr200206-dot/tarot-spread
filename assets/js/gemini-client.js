// Gemini 해석 요청 클라이언트.
// 브라우저는 Gemini API를 직접 호출하지 않는다 — data/_requests/에 요청 파일을 커밋하면
// GitHub Actions 워크플로(.github/workflows/gemini-interpret.yml)가 repo secret으로 Gemini를
// 호출하고, 결과를 data/_responses/에 커밋한다. 이 파일은 그 응답이 나타날 때까지 폴링한다.
// GEMINI_API_KEY는 GitHub Actions 안에서만 쓰이고 클라이언트 코드에는 절대 존재하지 않는다.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeRequestId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// onProgress(elapsedMs) 콜백으로 대기 상태를 UI에 반영할 수 있다.
async function requestAiInterpretation({ spreadQuestion, characterContext, positions }, onProgress) {
  const requestId = makeRequestId();

  await commitJsonFile(
    `data/_requests/${requestId}.json`,
    () => ({ spreadQuestion, characterContext, positions, requestedAt: new Date().toISOString() }),
    `AI 해석 요청: ${requestId}`
  );

  const intervalMs = SITE_CONFIG.aiPollIntervalMs || 4000;
  const timeoutMs = SITE_CONFIG.aiPollTimeoutMs || 120000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(intervalMs);
    if (onProgress) onProgress(Date.now() - startedAt);

    const { json } = await ghGetJsonFile(`data/_responses/${requestId}.json`);
    if (!json) continue;

    if (json.error) {
      throw new Error(json.error);
    }
    if (!Array.isArray(json.positions) || typeof json.overall !== "string") {
      throw new Error("AI 응답 형식이 올바르지 않습니다.");
    }
    return json;
  }

  throw new Error(
    "시간 초과: GitHub Actions 워크플로 실행이 아직 끝나지 않았을 수 있습니다. 저장소의 Actions 탭에서 진행 상황을 확인한 뒤 다시 시도해주세요."
  );
}
