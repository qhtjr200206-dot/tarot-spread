// 이 사이트가 데이터를 커밋할 GitHub 저장소 설정.
const SITE_CONFIG = {
  githubOwner: "qhtjr200206-dot",
  githubRepo: "tarot-spread",
  githubBranch: "main",
  // AI 해석 요청/응답 폴링 간격(ms)과 최대 대기 시간(ms). GitHub Actions 워크플로가
  // Gemini를 호출하는 데 보통 수십 초 정도 걸린다 (BUILD_GUIDE.md 4단계 참고).
  aiPollIntervalMs: 4000,
  aiPollTimeoutMs: 120000,
};
