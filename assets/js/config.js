// 이 사이트가 데이터를 커밋할 GitHub 저장소 설정.
// 실제 저장소를 만든 뒤 아래 두 값을 반드시 채워주세요.
const SITE_CONFIG = {
  githubOwner: "YOUR_GITHUB_USERNAME",
  githubRepo: "YOUR_REPO_NAME",
  githubBranch: "main",
  // Gemini 해석을 대신 호출해주는 Cloudflare Worker 주소 (BUILD_GUIDE.md 4단계 참고)
  geminiWorkerUrl: "https://YOUR-WORKER-SUBDOMAIN.workers.dev/api/interpret",
  // Worker의 ADMIN_SHARED_SECRET과 동일한 값. 아무나 Worker를 호출해 Gemini 키를 소진하는 것을 막기 위한 최소한의 장치.
  workerSharedSecret: "YOUR_SHARED_SECRET",
};
