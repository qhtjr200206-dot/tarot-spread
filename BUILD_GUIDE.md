# 실패 없이 구축하기 위한 가이드 (BUILD_GUIDE.md)

> 이 문서는 "어떻게 만들 것인가"를 다룹니다. 기능/데이터 정의는 `PLAN.md`를 먼저 읽으세요.

확정된 아키텍처:
- **호스팅**: GitHub Pages (정적 파일만, 별도 서버 없음)
- **기술 스택**: 순수 HTML/CSS/JS (빌드 도구 없음)
- **콘텐츠 저장**: 저장소 내 JSON 파일, 관리자가 브라우저에서 GitHub Contents API로 직접 커밋
- **관리자 인증**: GitHub Personal Access Token(PAT) 직접 입력, `sessionStorage`에만 보관
- **Gemini 연동**: Cloudflare Worker 프록시를 통해서만 호출 (API 키를 브라우저에 절대 노출하지 않음)

---

## 0. 왜 이 구조인가 (실패 지점 미리 이해하기)

정적 사이트 + "관리자가 콘텐츠 추가" + "AI API 호출"을 동시에 하려고 하면 아래 세 가지에서 대부분 실패합니다. 이 가이드는 이 세 가지를 처음부터 피해가도록 순서를 짰습니다.

1. **"정적 사이트인데 어떻게 저장하지?"** → DB 없이 저장소 자체를 DB처럼 씁니다. 관리자의 브라우저가 GitHub API를 호출해 JSON 파일을 커밋하고, GitHub Pages는 그 저장소를 그대로 서빙합니다.
2. **"API 키를 어디에 두지?"** → 절대 저장소/클라이언트 JS에 두지 않습니다. Cloudflare Worker라는, GitHub Pages와 별개인 작은 서버리스 함수 안에만 둡니다.
3. **"동시에 여러 파일을 갱신하다가 꼬이지 않을까?"** → 매 쓰기 작업 전 항상 최신 파일 `sha`를 다시 읽어온 뒤 갱신하는 패턴을 처음부터 강제합니다 (아래 3.3 참고).

---

## 1. 사전 준비 체크리스트

- [ ] GitHub 계정 및 이 프로젝트용 저장소 (public — GitHub Pages 무료 플랜은 public 저장소 기준)
- [ ] 관리자 본인이 사용할 **Fine-grained PAT** 발급
  - Settings → Developer settings → Personal access tokens → Fine-grained tokens
  - Repository access: 이 저장소만 선택
  - Permissions: **Contents: Read and write** 만 부여 (그 외 권한 부여 금지 — 유출 시 피해 범위를 최소화)
  - 만료일을 짧게(예: 90일) 설정하고 만료 시 재발급하는 습관을 들일 것
- [ ] Cloudflare 계정 (무료 플랜으로 충분) — Gemini 프록시용
- [ ] Google AI Studio에서 발급한 Gemini API 키

> ⚠️ 이 시점에서 절대 하지 말 것: PAT나 Gemini 키를 `.env`든 뭐든 저장소 안 파일로 커밋하는 것. 저장소는 public이라 즉시 유출됩니다.

---

## 2. 저장소 구조

```
/
├── index.html
├── spread.html
├── reading.html
├── admin/
│   ├── login.html
│   ├── spread-new.html
│   └── reading-new.html
├── assets/
│   ├── css/
│   │   ├── theme.css        # 라이트/다크 + 보라 포인트 색상 변수
│   │   └── main.css
│   ├── js/
│   │   ├── theme.js         # 다크/라이트 토글
│   │   ├── auth.js          # PAT 저장/검증
│   │   ├── github-api.js    # Contents API 래퍼 (읽기/쓰기 공통 함수)
│   │   ├── gemini-client.js # Cloudflare Worker 호출 래퍼
│   │   ├── cards.js         # 78장 카드 이름 목록 (자동완성용)
│   │   ├── page-home.js
│   │   ├── page-spread.js
│   │   ├── page-reading.js
│   │   ├── page-admin-login.js
│   │   ├── page-admin-spread-new.js
│   │   └── page-admin-reading-new.js
├── data/
│   ├── spreads/
│   │   └── index.json
│   └── readings/
├── cloudflare-worker/
│   ├── src/worker.js
│   └── wrangler.toml        # 키 값 자체는 여기 두지 않음 (3단계 참고)
├── .nojekyll
├── PLAN.md
└── BUILD_GUIDE.md
```

`.nojekyll` 빈 파일을 루트에 반드시 추가하세요. GitHub Pages는 기본적으로 Jekyll로 빌드를 시도하는데, `_`로 시작하는 폴더나 파일을 무시해버리는 등 예상 밖의 동작을 하는 경우가 있습니다. 이 프로젝트는 순수 정적 파일이라 Jekyll 처리가 전혀 필요 없으므로, `.nojekyll`로 아예 꺼버리는 것이 가장 안전합니다.

---

## 3. 단계별 구축 순서

**원칙: 각 단계는 그 자체로 눈으로 확인 가능한 결과물이 있어야 다음 단계로 넘어갑니다. 여러 단계를 한번에 만들고 나중에 몰아서 디버깅하지 마세요.**

### 3단계 개요
1. 정적 뼈대 + 더미 데이터로 열람 화면 완성
2. 다크/라이트 테마
3. 관리자 인증 + GitHub API 쓰기 (스프레드/리딩 생성)
4. Gemini 연동 (Cloudflare Worker)
5. GitHub Pages 배포 및 통합 테스트

### 3.1 정적 뼈대 (Phase 1)

1. `data/spreads/index.json`과 예시 스프레드 1개, 예시 리딩 1개를 **손으로 직접** 작성해 넣습니다 (아직 관리자 기능 없이).
2. `index.html` / `spread.html` / `reading.html`이 이 더미 JSON을 `fetch()`로 읽어서 렌더링하도록 만듭니다.
3. 로컬에서 정적 서버로 띄워 확인합니다 (아래 명령 참고). `file://`로 그냥 열면 `fetch()`가 CORS 정책에 막혀 실패하니 반드시 로컬 서버를 통해 확인하세요.

```bash
# 저장소 루트에서
python -m http.server 8080
# 또는
npx serve .
```

**체크포인트**: 홈 → 스프레드 상세 → 리딩 상세까지 더미 데이터로 끊김 없이 이동/열람되면 통과.

### 3.2 다크/라이트 테마 (Phase 2)

- `theme.css`에 8.2절 컬러 토큰을 CSS 커스텀 프로퍼티로 정의하고, `:root`(라이트 기본값) + `[data-theme="dark"]`(다크 오버라이드) 구조로 작성합니다.
- `theme.js`: 최초 진입 시 `localStorage`에 저장된 값이 있으면 그것을, 없으면 `window.matchMedia('(prefers-color-scheme: dark)')`를 따르고, 토글 클릭 시 `<html data-theme="...">`을 바꾸고 `localStorage`에 저장합니다.

**체크포인트**: 토글을 눌러도 새로고침해도 선택한 테마가 유지되는지 확인.

### 3.3 관리자 인증 + GitHub API 쓰기 (Phase 3) — 가장 실패하기 쉬운 단계

1. `admin/login.html`에서 PAT를 입력받으면, 바로 `GET https://api.github.com/repos/{owner}/{repo}` 를 `Authorization: Bearer {PAT}` 헤더로 호출해 응답 코드로 유효성/권한을 확인합니다. 성공 시에만 `sessionStorage`에 저장하고, 실패 시 사용자에게 원인(토큰 무효/권한 부족/저장소 없음)을 구분해서 보여줍니다.
2. **파일 쓰기(생성/수정)는 반드시 아래 순서를 지키세요.** GitHub Contents API는 파일을 수정할 때 현재 파일의 `sha`를 요구하며, 이를 생략하거나 오래된 `sha`를 보내면 409 충돌이 납니다.
   - ① `GET /repos/{owner}/{repo}/contents/{path}` 로 최신 내용과 `sha`를 가져온다.
   - ② 그 내용을 자바스크립트 객체로 파싱해 필요한 항목을 추가/수정한다.
   - ③ `PUT /repos/{owner}/{repo}/contents/{path}` 로 `content`(Base64 인코딩), `sha`(방금 받은 값), `message`를 보내 커밋한다.
   - ④ 새 파일 생성 시에는 `sha`를 아예 보내지 않는다 (파일이 없으므로).
   - ⑤ 409 응답을 받으면 "동시에 다른 곳에서 수정됨"이므로, ①부터 자동으로 1회 재시도하는 로직을 넣어두면 훨씬 덜 삽질합니다.
   - `data/spreads/index.json`, `data/readings/{spreadId}/index.json` 처럼 **여러 작업이 공유하는 "목록" 파일**이 충돌이 가장 잦은 지점이니, 이 파일들을 건드리는 함수는 반드시 위 5단계 패턴을 공용 함수(`github-api.js`의 `updateJsonFile()` 같은)로 묶어서 재사용하세요. 페이지마다 따로 구현하면 한쪽만 재시도 로직이 빠지는 실수가 생깁니다.
3. Base64 인코딩 시 한글이 포함되므로 `btoa(unescape(encodeURIComponent(json)))` 형태로 UTF-8 안전하게 인코딩해야 합니다. 그냥 `btoa(json)`을 쓰면 한글에서 깨집니다.
4. `spread-new.html`, `reading-new.html`은 로그인(`sessionStorage`에 PAT 존재) 여부를 최상단에서 확인하고, 없으면 `login.html`로 리다이렉트합니다.

**체크포인트**: 관리자 화면에서 새 스프레드를 하나 만들면, GitHub 저장소에 실제 커밋이 생기고, 홈 화면에 새로고침만으로 반영되는지 확인.

> 💡 방금 커밋한 내용이 홈 화면에 바로 안 보이면: 원인은 (a) GitHub Pages CDN 캐시 지연(보통 수십 초~수 분) 이거나 (b) 브라우저의 `fetch` 캐시입니다. 관리자 화면에서 "저장 후 결과 확인"용 fetch는 `fetch(url, { cache: 'no-store' })`를 쓰고, 가능하면 Pages로 서빙된 사본이 아니라 방금 커밋에 사용한 GitHub API 응답을 그대로 화면에 반영해 "안 보여서 실패한 줄 알았다"는 혼란을 피하세요.

### 3.4 Gemini 연동 — Cloudflare Worker (Phase 4)

**저장소 코드(GitHub Pages)와 Worker 코드는 배포 경로가 다릅니다.** Worker는 GitHub Pages에 올라가지 않고 Cloudflare에 별도로 배포합니다. `cloudflare-worker/` 폴더는 소스만 저장소에 같이 두는 것일 뿐입니다.

1. `npm create cloudflare@latest` 로 `cloudflare-worker/` 안에 Worker 프로젝트를 만듭니다.
2. Gemini API 키는 코드에 쓰지 않고 `wrangler secret put GEMINI_API_KEY` 명령으로 Cloudflare에만 등록합니다.
3. Worker는 `POST /api/interpret` 한 경로만 처리합니다. 요청 바디로 스프레드 질문 + 포지션별(순서, 의미, 카드명) 배열을 받아, 하나의 프롬프트로 합쳐 Gemini API를 **1회** 호출하고, 포지션별 해석 + 총합 해석을 JSON으로 묶어 응답합니다. (구조화된 응답을 받기 위해 Gemini의 JSON 모드/응답 스키마 지정 기능을 사용하면 파싱이 훨씬 안정적입니다.)
4. **CORS를 반드시 명시적으로 설정하세요.** 아래를 빠뜨리면 브라우저 콘솔에 CORS 에러만 찍히고 원인 파악이 오래 걸리는, 가장 흔한 실패 지점입니다.
   - `OPTIONS` 프리플라이트 요청에 204와 함께 `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`를 응답.
   - 실제 `POST` 응답에도 `Access-Control-Allow-Origin`을 GitHub Pages 도메인(예: `https://{username}.github.io`)으로 명시. `*`는 지양 — 아무 사이트나 이 Worker를 가져다 쓸 수 있게 됩니다.
5. **남용 방지**: 이 Worker의 URL은 결국 클라이언트 JS 안에 노출됩니다. 완전히 막을 수는 없지만 아래로 위험을 낮추세요.
   - Worker에 관리자 화면에서 보내는 공유 비밀값(`X-Admin-Secret` 헤더)을 하나 더 요구하고, Worker 환경변수의 값과 일치할 때만 처리 (역시 secret으로 등록, 브라우저 소스에는 남지만 캐주얼한 스캔은 걸러냄).
   - Cloudflare 대시보드에서 해당 라우트에 Rate Limiting 규칙(예: 분당 5회)을 걸어 키 소진/과금을 방지.
6. `gemini-client.js`에서 이 Worker 엔드포인트로 `fetch(POST)`하고, 응답을 `reading-new.html` 폼에 채워 넣습니다.

**체크포인트**: 로컬에서 `wrangler dev`로 Worker를 띄우고, 관리자 화면에서 "AI 해석 생성" 버튼을 눌렀을 때 실제 Gemini 응답이 폼에 채워지는지 확인 → 이후 `wrangler deploy`로 실제 배포.

### 3.5 GitHub Pages 배포 (Phase 5)

1. 저장소 Settings → Pages → Source를 `Deploy from a branch`, Branch를 `main` / `/ (root)`로 설정합니다. (빌드 도구가 없으므로 GitHub Actions 빌드 파이프라인은 필요 없습니다.)
2. `assets/js/`의 모든 API 호출 URL(Worker 엔드포인트 등)이 상대경로가 아닌 절대 URL인지 확인합니다.
3. 실제 배포된 `https://{username}.github.io/{repo}/` 주소에서 처음부터 끝까지(스프레드 생성 → 리딩 생성 → AI 해석 → 저장 → 목록/상세 열람) 한 번 통으로 리허설합니다. 로컬 서버에서는 통과했지만 배포 후 깨지는 대표적 원인은 **경로 문제**입니다(저장소 이름이 서브패스로 붙으므로 절대경로 `/assets/...`가 아니라 `./assets/...` 또는 `<base>` 태그 기준 상대경로를 써야 함).

**체크포인트**: 로그아웃 상태의 시크릿 창(비관리자 시점)에서 전체 열람 흐름이 정상 동작.

---

## 4. 흔한 실패 지점 요약 체크리스트

- [ ] `fetch()`를 `file://`로 직접 열어서 테스트하지 않았는가 (로컬 서버 필수)
- [ ] PAT/Gemini 키가 어떤 커밋에도, 어떤 JS 파일에도 하드코딩되어 있지 않은가
- [ ] JSON 파일 쓰기 전 항상 최신 `sha`를 다시 가져오는가 (특히 `index.json`류)
- [ ] 한글 포함 콘텐츠를 Base64 인코딩할 때 UTF-8 안전 처리를 했는가
- [ ] Cloudflare Worker의 CORS 헤더(프리플라이트 포함)를 명시적으로 설정했는가
- [ ] Worker 남용 방지(공유 비밀값 + Rate Limit)를 걸었는가
- [ ] `.nojekyll` 파일을 루트에 추가했는가
- [ ] 저장소 이름이 서브패스로 붙는 GitHub Pages 환경에서 자산 경로가 상대경로인가
- [ ] 리딩 저장 시 Gemini 호출이 정확히 1회만 발생하는가 (재시도/중복 클릭 방지 처리)
- [ ] PAT는 이 저장소의 Contents Read/write 권한으로만 최소화되어 있는가

---

## 5. 이후 유지보수 메모

- Gemini 모델/프롬프트를 바꾸고 싶으면 `cloudflare-worker/src/worker.js`만 수정 후 `wrangler deploy`. GitHub Pages 쪽 재배포는 필요 없습니다.
- 스프레드/리딩 데이터 구조를 바꾸려면 `PLAN.md`의 6절(데이터 모델)을 먼저 갱신하고, 기존 JSON 파일 전체에 마이그레이션이 필요한지 확인하세요 (파일 개수가 적을 때는 수동 편집도 충분).
- PAT는 만료 전 재발급 후 관리자 로그인 화면에서 다시 로그인하면 됩니다 (별도 설정 변경 불필요).
