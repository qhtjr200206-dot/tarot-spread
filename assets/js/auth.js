// 관리자 로그인 상태 관리 (GitHub PAT 기반).
// PAT는 절대 저장소나 localStorage에 남기지 않고 sessionStorage에만 보관한다.

const AUTH_STORAGE_KEY = "tarot-admin-pat";
const AUTH_USER_KEY = "tarot-admin-user";

function getAdminToken() {
  return sessionStorage.getItem(AUTH_STORAGE_KEY);
}

function getAdminUser() {
  return sessionStorage.getItem(AUTH_USER_KEY);
}

function isAdminLoggedIn() {
  return Boolean(getAdminToken());
}

function adminLogout() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
}

// 저장소에 대한 Contents:Read/Write 권한이 있는지 확인.
// 성공 시 { ok: true } / 실패 시 { ok: false, reason: "invalid" | "forbidden" | "notfound" | "network" }
async function verifyAdminToken(token) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${SITE_CONFIG.githubOwner}/${SITE_CONFIG.githubRepo}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      }
    );
    if (res.status === 401) return { ok: false, reason: "invalid" };
    if (res.status === 403) return { ok: false, reason: "forbidden" };
    if (res.status === 404) return { ok: false, reason: "notfound" };
    if (!res.ok) return { ok: false, reason: "network" };

    const repoInfo = await res.json();
    if (!repoInfo.permissions || !repoInfo.permissions.push) {
      return { ok: false, reason: "forbidden" };
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    const userInfo = userRes.ok ? await userRes.json() : null;
    return { ok: true, login: userInfo ? userInfo.login : "관리자" };
  } catch (err) {
    return { ok: false, reason: "network" };
  }
}

function renderHeaderAuthStatus() {
  const statusEl = document.getElementById("admin-status");
  if (!statusEl) return;

  if (isAdminLoggedIn()) {
    const user = getAdminUser() || "관리자";
    statusEl.innerHTML = `${escapeHtml(user)}님으로 접속 중 · <a href="#" id="logout-link">로그아웃</a>`;
    const logoutLink = document.getElementById("logout-link");
    if (logoutLink) {
      logoutLink.addEventListener("click", function (e) {
        e.preventDefault();
        adminLogout();
        window.location.reload();
      });
    }
  } else {
    const path = window.location.pathname.includes("/admin/") ? "login.html" : "./admin/login.html";
    statusEl.innerHTML = `<a href="${path}">관리자 로그인</a>`;
  }

  document.querySelectorAll("[data-admin-only]").forEach(function (el) {
    el.style.display = isAdminLoggedIn() ? "" : "none";
  });
}

document.addEventListener("DOMContentLoaded", renderHeaderAuthStatus);
