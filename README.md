# 타로 스프레드 아카이브

관리자가 타로 스프레드(질문 + 카드 자리별 의미)를 만들고, 날짜별 리딩(뽑은 카드 + AI/개인 해석)을 기록해두면 누구나 방문해 열람할 수 있는 정적 사이트입니다. GitHub Pages로 호스팅됩니다.

- 기획 문서: [`PLAN.md`](./PLAN.md)
- 구축/배포 가이드 및 실패 지점 체크리스트: [`BUILD_GUIDE.md`](./BUILD_GUIDE.md)

## 로컬에서 실행하기

빌드 도구가 없는 순수 정적 사이트이므로, 로컬 서버로만 띄우면 됩니다 (`fetch()`가 `file://`에서는 동작하지 않습니다).

```bash
npx http-server -p 8080 -c-1 .
# http://localhost:8080 접속
```

## 배포 전 반드시 채워야 할 값

1. `assets/js/config.js`
   - `githubOwner` / `githubRepo`: 이 사이트가 데이터를 커밋할 실제 GitHub 저장소.
   - `geminiWorkerUrl`: 아래 3번에서 배포한 Cloudflare Worker 주소.
   - `workerSharedSecret`: Worker의 `ADMIN_SHARED_SECRET`과 동일한 값.
2. GitHub 저장소 Settings → Pages → Source를 `main` 브랜치 `/ (root)`로 설정.
3. `cloudflare-worker/` 배포 (Gemini 키를 숨기는 프록시, GitHub Pages와 별개로 배포):
   ```bash
   cd cloudflare-worker
   npm install
   npx wrangler login
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put ADMIN_SHARED_SECRET
   npx wrangler deploy
   ```
   `wrangler.toml`의 `ALLOWED_ORIGIN`도 실제 GitHub Pages 주소로 바꿔주세요.
4. 관리자로 로그인하려면 `/admin/login.html`에서 이 저장소의 **Contents: Read and write** 권한을 가진 GitHub Personal Access Token을 입력하세요.

자세한 단계별 설명과 흔한 실패 지점은 `BUILD_GUIDE.md`를 참고하세요.

## 디렉터리 구조

```
index.html / spread.html / reading.html   방문자용 열람 페이지
admin/                                     관리자 전용 페이지 (로그인, 스프레드/리딩 추가)
assets/css, assets/js                      공통 스타일 및 스크립트
data/spreads, data/readings                콘텐츠 데이터 (JSON, 저장소 자체가 DB 역할)
cloudflare-worker/                         Gemini API 키를 숨기는 프록시 (GitHub Pages 밖에 별도 배포)
```
