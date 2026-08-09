// GitHub Contents API를 이용한 JSON 파일 읽기/쓰기 공용 함수.
// 매 쓰기 전 최신 sha를 다시 읽어오고, 409(충돌) 발생 시 한 번 재시도한다. (BUILD_GUIDE.md 3.3 참고)

function encodeBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64Utf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
}

function ghApiUrl(path) {
  return `https://api.github.com/repos/${SITE_CONFIG.githubOwner}/${SITE_CONFIG.githubRepo}/contents/${path}`;
}

function ghHeaders() {
  const token = getAdminToken();
  if (!token) throw new Error("로그인이 필요합니다.");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };
}

// 파일을 읽어 { sha, json } 반환. 파일이 없으면 { sha: null, json: null }.
async function ghGetJsonFile(path) {
  const res = await fetch(`${ghApiUrl(path)}?ref=${SITE_CONFIG.githubBranch}`, {
    headers: ghHeaders(),
    cache: "no-store",
  });
  if (res.status === 404) {
    return { sha: null, json: null };
  }
  if (!res.ok) {
    throw new Error(`파일 조회 실패 (${res.status}): ${path}`);
  }
  const data = await res.json();
  const text = decodeBase64Utf8(data.content);
  return { sha: data.sha, json: text.trim() ? JSON.parse(text) : null };
}

// mutateFn(currentJsonOrNull) => nextJson 형태로 파일을 갱신/생성한다.
// 쓰기 직전 최신 sha를 다시 읽으므로, index.json처럼 여러 곳에서 갱신되는 파일도 안전하게 처리한다.
async function commitJsonFile(path, mutateFn, message, attempt) {
  attempt = attempt || 0;
  const { sha, json } = await ghGetJsonFile(path);
  const next = mutateFn(json);

  const body = {
    message,
    content: encodeBase64Utf8(JSON.stringify(next, null, 2) + "\n"),
    branch: SITE_CONFIG.githubBranch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(ghApiUrl(path), {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 409 && attempt < 1) {
    return commitJsonFile(path, mutateFn, message, attempt + 1);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`저장 실패 (${res.status}) - ${path}: ${errText}`);
  }
  return next;
}
