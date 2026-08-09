(function () {
  const form = document.getElementById("login-form");
  const alertEl = document.getElementById("login-alert");
  const submitBtn = document.getElementById("login-submit");

  const REASON_MESSAGES = {
    invalid: "토큰이 유효하지 않습니다. 토큰 값을 다시 확인해주세요.",
    forbidden: "이 저장소에 대한 쓰기 권한이 없습니다. 토큰의 Contents 권한(Read and write)을 확인해주세요.",
    notfound: "저장소를 찾을 수 없습니다. assets/js/config.js의 githubOwner/githubRepo 값을 확인해주세요.",
    network: "GitHub API 요청 중 오류가 발생했습니다. 네트워크 상태를 확인해주세요.",
  };

  if (isAdminLoggedIn()) {
    alertEl.innerHTML = `<div class="alert alert-info">이미 관리자로 로그인되어 있습니다. (${escapeHtml(getAdminUser() || "")})</div>`;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const token = document.getElementById("pat-input").value.trim();
    if (!token) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "확인 중...";
    alertEl.innerHTML = "";

    const result = await verifyAdminToken(token);

    if (result.ok) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, token);
      sessionStorage.setItem(AUTH_USER_KEY, result.login);
      window.location.href = "../index.html";
      return;
    }

    alertEl.innerHTML = `<div class="alert alert-error">${escapeHtml(REASON_MESSAGES[result.reason] || "로그인에 실패했습니다.")}</div>`;
    submitBtn.disabled = false;
    submitBtn.textContent = "로그인";
  });
})();
