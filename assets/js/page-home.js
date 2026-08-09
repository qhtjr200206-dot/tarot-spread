(async function () {
  const listEl = document.getElementById("spread-list");

  try {
    const spreads = await fetchJson("./data/spreads/index.json");

    if (!spreads.length) {
      listEl.innerHTML = `<div class="empty-state">아직 등록된 스프레드가 없습니다.</div>`;
      return;
    }

    listEl.innerHTML = spreads
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((spread) => {
        const displayName = spread.customName || spread.question;
        const latest = spread.latestReadingDate ? formatDate(spread.latestReadingDate) : "기록 없음";
        return `
          <a class="list-card" href="./spread.html?id=${encodeURIComponent(spread.id)}">
            <p class="list-card-title">${escapeHtml(displayName)}</p>
            <div class="list-card-meta">
              <span class="badge">${spread.positionCount}자리</span>
              <span>질문: ${escapeHtml(spread.question)}</span>
              <span>리딩 ${spread.readingCount}건</span>
              <span>최근 리딩: ${latest}</span>
            </div>
          </a>
        `;
      })
      .join("");
  } catch (err) {
    renderError(listEl, "스프레드 목록을 불러오지 못했습니다: " + err.message);
  }
})();
