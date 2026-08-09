# 실패 없이 구축하기 위한 가이드 (BUILD_GUIDE.md)

> 이 문서는 "어떻게 만들 것인가"를 다룹니다. 기능/데이터 정의는 `PLAN.md`를 먼저 읽으세요.

확정된 아키텍처:
- **호스팅**: GitHub Pages (정적 파일만, 별도 서버 없음)
- **기술 스택**: 순수 HTML/CSS/JS (빌드 도구 없음)
- **콘텐츠 저장**: 저장소 내 JSON 파일, 관리자가 브라우저에서 GitHub Contents API로 직접 커밋
- **관리자 인증**: GitHub Personal Access Token(PAT) 직접 입력, `sessionStorage`에만 보관
- **Gemini 연동**: GitHub Actions를 통해서만 호출 (API 키를 브라우저에 절대 노출하지 않음). 처음엔 Cloudflare Worker 프록시로 시작했으나, Google Gemini API의 지역 차단과 Cloudflare Workers의 무료 플랜 지역 미고정이 충돌해 실패했습니다 (0장 참고) — 이 경험 자체가 "실패 없이 구축" 가이드의 좋은 사례라 남겨둡니다.

---

## 0. 왜 이 구조인가 (실패 지점 미리 이해하기)

정적 사이트 + "관리자가 콘텐츠 추가" + "AI API 호출"을 동시에 하려고 하면 아래 세 가지에서 대부분 실패합니다. 이 가이드는 이 세 가지를 처음부터 피해가도록 순서를 짰습니다.

1. **"정적 사이트인데 어떻게 저장하지?"** → DB 없이 저장소 자체를 DB처럼 씁니다. 관리자의 브라우저가 GitHub API를 호출해 JSON 파일을 커밋하고, GitHub Pages는 그 저장소를 그대로 서빙합니다.
2. **"API 키를 어디에 두지?"** → 절대 저장소/클라이언트 JS에 두지 않습니다. GitHub Actions의 repo secret 안에만 두고, 관리자 화면은 "요청 파일 커밋 → Actions가 처리 → 응답 파일 커밋" 흐름으로 간접 호출합니다.
3. **"동시에 여러 파일을 갱신하다가 꼬이지 않을까?"** → 매 쓰기 작업 전 항상 최신 파일 `sha`를 다시 읽어온 뒤 갱신하는 패턴을 처음부터 강제합니다 (아래 3.3 참고).
4. **"AI 프록시 서버를 어디에 둬야 지역 차단 없이 안정적으로 동작할까?"** → Cloudflare Workers처럼 요청마다 실행 위치가 전 세계 임의의 엣지로 흩어지는 플랫폼은 Google Gemini API의 지역 제한과 충돌할 수 있습니다. GitHub Actions처럼 고정된 인프라에서 도는 방식이 이 문제를 피해갑니다.

---

## 1. 사전 준비 체크리스트

- [ ] GitHub 계정 및 이 프로젝트용 저장소 (public — GitHub Pages 무료 플랜은 public 저장소 기준)
- [ ] 관리자 본인이 사용할 **Fine-grained PAT** 발급
  - Settings → Developer settings → Personal access tokens → Fine-grained tokens
  - Repository access: 이 저장소만 선택
  - Permissions: **Contents: Read and write** 만 부여 (그 외 권한 부여 금지 — 유출 시 피해 범위를 최소화)
  - 만료일을 짧게(예: 90일) 설정하고 만료 시 재발급하는 습관을 들일 것
- [ ] Google AI Studio에서 발급한 Gemini API 키
- [ ] 저장소 Settings → Secrets and variables → Actions 에 `GEMINI_API_KEY` 등록 (아래 3.4 참고)

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
│   │   ├── gemini-client.js # 요청 파일 커밋 + 응답 파일 폴링
│   │   ├── cards.js         # 78장 카드 그룹 목록 (선택 UI용)
│   │   ├── page-home.js
│   │   ├── page-spread.js
│   │   ├── page-reading.js
│   │   ├── page-admin-login.js
│   │   ├── page-admin-spread-new.js
│   │   └── page-admin-reading-new.js
├── data/
│   ├── spreads/
│   │   └── index.json
│   ├── readings/
│   ├── _requests/            # AI 해석 요청 임시 파일 (Actions가 소비 후 삭제)
│   └── _responses/           # AI 해석 응답 파일 (클라이언트가 폴링)
├── .github/
│   ├── workflows/
│   │   └── gemini-interpret.yml   # data/_requests/** push 시 실행
│   └── scripts/
│       ├── process-requests.mjs   # Gemini 호출 + 응답 파일 생성
│       └── card-meanings.mjs      # 78장 카드 캐릭터 분석용 참고 의미표
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

### 3.4 Gemini 연동 — GitHub Actions (Phase 4)

**왜 Cloudflare Worker가 아닌가**: 처음엔 Cloudflare Worker 프록시로 구현했지만, 실제 배포 후 Gemini API가 `"User location is not supported"` 오류를 계속 반환했습니다. 원인은 Google Gemini API가 EU 등 특정 지역에서의 접근을 차단하는데, Cloudflare Workers는 요청마다 전 세계 엣지 노드 중 임의의 위치에서 실행되고 무료 플랜에서는 실행 지역을 고정할 방법이 없기 때문입니다(지역 고정은 Enterprise 전용). Smart Placement(`[placement] mode = "smart"`)로도 해결되지 않았습니다. **이 문제는 Cloudflare/Google 개발자 커뮤니티에도 다수 보고된, 무료 플랜에서는 확실한 해결책이 없는 이슈**이니 처음부터 피하는 것이 낫습니다.

**대안**: GitHub Actions는 고정된 인프라(Microsoft Azure, 주로 미국 리전)에서 실행되므로 이 지역 차단 문제가 발생하지 않습니다. 다만 트레이드오프로 결과 반영까지 수십 초~2분 정도 걸립니다(동기 호출이 아니라 "커밋 → 워크플로 실행 → 커밋" 비동기 흐름이기 때문).

**흐름**
1. 관리자가 "AI 해석 생성"을 누르면 `gemini-client.js`가 `data/_requests/{requestId}.json`에 스프레드 질문·캐릭터 정보·카드 배열을 커밋합니다.
2. `.github/workflows/gemini-interpret.yml`이 `data/_requests/**` 경로에 대한 push를 감지해 실행됩니다.
3. `.github/scripts/process-requests.mjs`가 요청 파일을 읽고, `.github/scripts/card-meanings.mjs`(78장 카드의 캐릭터 분석용 참고 의미표)에서 카드+방향에 맞는 요약/키워드를 찾아 프롬프트에 포함시킨 뒤, repo secret `GEMINI_API_KEY`로 Gemini API를 **1회** 호출합니다 (구조화된 JSON 응답을 위해 `responseSchema` 사용).
4. 결과를 `data/_responses/{requestId}.json`으로 쓰고, 처리한 요청 파일은 삭제한 뒤 워크플로 자체가 커밋·푸시합니다 (커밋 메시지에 `[skip ci]`를 넣어 이 커밋이 워크플로를 다시 트리거하지 않게 합니다).
5. `gemini-client.js`는 `data/_responses/{requestId}.json`이 나타날 때까지 4초 간격으로 폴링하다가(최대 2분), 찾으면 폼에 채웁니다.

**설정 방법**
1. 저장소 Settings → Secrets and variables → Actions → New repository secret → 이름 `GEMINI_API_KEY`, 값은 Google AI Studio에서 발급한 키. (브라우저 UI에서 직접 입력하므로 터미널/AI 어시스턴트 어디에도 키가 노출되지 않는 가장 안전한 방법입니다.)
2. 그 외 설정은 필요 없습니다 — Worker 배포, CORS 설정, 별도 시크릿 값(예전의 `ADMIN_SHARED_SECRET`) 모두 불필요합니다. 요청 자체가 이미 관리자의 GitHub 쓰기 권한(PAT)으로 커밋되므로 별도 남용 방지 장치가 필요 없습니다.
3. **모델 선택 주의**: `gemini-2.0-flash`는 2026년 3월 서비스 종료되었고 `gemini-2.5-flash-lite`는 신규 사용자에게 제공되지 않습니다. 워크플로 YAML의 `GEMINI_MODEL` 환경변수를 `gemini-2.5-flash` 등 현재 사용 가능한 모델로 유지하세요. 무료 티어 한도는 https://aistudio.google.com/rate-limit 에서 실시간 확인하는 것이 가장 정확합니다(고정 수치를 문서에 박아두지 마세요 — 자주 바뀝니다).

**체크포인트**: `git push`로 `data/_requests/`에 테스트용 JSON 파일을 하나 직접 커밋해보고, 저장소 Actions 탭에서 워크플로가 성공적으로 돌아 `data/_responses/`에 결과 파일이 생기는지 확인 → 그다음 실제 관리자 화면에서 "AI 해석 생성" 버튼으로 전체 흐름을 확인.

### 3.5 GitHub Pages 배포 (Phase 5)

1. 저장소 Settings → Pages → Source를 `Deploy from a branch`, Branch를 `main` / `/ (root)`로 설정합니다. (빌드 도구가 없으므로 GitHub Actions 빌드 파이프라인은 필요 없습니다.)
2. `assets/js/`의 모든 자산 경로가 절대경로(`/assets/...`)가 아니라 상대경로(`./assets/...`)로 되어 있는지 확인합니다.
3. 실제 배포된 `https://{username}.github.io/{repo}/` 주소에서 처음부터 끝까지(스프레드 생성 → 리딩 생성 → AI 해석 → 저장 → 목록/상세 열람) 한 번 통으로 리허설합니다. 로컬 서버에서는 통과했지만 배포 후 깨지는 대표적 원인은 **경로 문제**입니다(저장소 이름이 서브패스로 붙으므로 절대경로 `/assets/...`가 아니라 `./assets/...` 또는 `<base>` 태그 기준 상대경로를 써야 함).

**체크포인트**: 로그아웃 상태의 시크릿 창(비관리자 시점)에서 전체 열람 흐름이 정상 동작.

---

## 4. 흔한 실패 지점 요약 체크리스트

- [ ] `fetch()`를 `file://`로 직접 열어서 테스트하지 않았는가 (로컬 서버 필수)
- [ ] PAT/Gemini 키가 어떤 커밋에도, 어떤 JS 파일에도 하드코딩되어 있지 않은가
- [ ] JSON 파일 쓰기 전 항상 최신 `sha`를 다시 가져오는가 (특히 `index.json`류)
- [ ] 한글 포함 콘텐츠를 Base64 인코딩할 때 UTF-8 안전 처리를 했는가
- [ ] `.nojekyll` 파일을 루트에 추가했는가
- [ ] 저장소 이름이 서브패스로 붙는 GitHub Pages 환경에서 자산 경로가 상대경로인가
- [ ] 리딩 저장 시 Gemini 호출이 정확히 1회만 발생하는가 (재생성은 확인 후에만)
- [ ] PAT는 이 저장소의 Contents Read/write 권한으로만 최소화되어 있는가
- [ ] AI 해석 프록시로 지역 제한 없는 인프라(GitHub Actions 등)를 쓰고 있는가 — Cloudflare Workers 무료 플랜은 Gemini API 지역 차단과 충돌할 수 있음
- [ ] GitHub Actions 워크플로 커밋에 `[skip ci]`를 넣어 자기 자신을 무한 트리거하지 않는가

---

## 5. 이후 유지보수 메모

- Gemini 모델/프롬프트를 바꾸고 싶으면 `.github/scripts/process-requests.mjs`와 `.github/workflows/gemini-interpret.yml`의 `GEMINI_MODEL`만 수정해서 커밋하면 됩니다. 별도 배포 절차가 없습니다.
- 카드 참고 의미표를 수정/보강하려면 `.github/scripts/card-meanings.mjs`를 편집하세요.
- 스프레드/리딩 데이터 구조를 바꾸려면 `PLAN.md`의 6절(데이터 모델)을 먼저 갱신하고, 기존 JSON 파일 전체에 마이그레이션이 필요한지 확인하세요 (파일 개수가 적을 때는 수동 편집도 충분).
- PAT는 만료 전 재발급 후 관리자 로그인 화면에서 다시 로그인하면 됩니다 (별도 설정 변경 불필요).
