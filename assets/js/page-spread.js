(async function () {
  const spreadId = qs("id");
  const headerEl = document.getElementById("spread-header");
  const positionsWrap = document.getElementById("positions-table-wrap");
  const readingListEl = document.getElementById("reading-list");
  const newReadingLink = document.getElementById("new-reading-link");
  const editSpreadLink = document.getElementById("edit-spread-link");

  if (!spreadId) {
    renderError(headerEl, "스프레드 id가 없습니다.");
    return;
  }

  try {
    const spread = await fetchJson(`./data/spreads/${encodeURIComponent(spreadId)}.json`);
    const displayName = spread.customName || spread.question;

    document.title = `${displayName} · 타로 스프레드 아카이브`;
    headerEl.innerHTML = `
      <h1 class="page-title">${escapeHtml(displayName)}</h1>
      <p class="page-subtitle">${escapeHtml(spread.question)}${
        spread.description ? " — " + escapeHtml(spread.description) : ""
      }</p>
    `;

    const positions = (spread.positions || []).slice().sort((a, b) => a.order - b.order);
    positionsWrap.innerHTML = `
      <table class="positions-table">
        <thead>
          <tr><th>순서</th><th>이름</th><th>의미</th></tr>
        </thead>
        <tbody>
          ${positions
            .map(
              (p) => `
            <tr>
              <td><span class="order-badge">${p.order}</span></td>
              <td>${escapeHtml(p.label)}</td>
              <td>${escapeHtml(p.meaning)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    if (newReadingLink) {
      newReadingLink.href = `./admin/reading-new.html?spread=${encodeURIComponent(spreadId)}`;
    }
    if (editSpreadLink) {
      editSpreadLink.href = `./admin/spread-new.html?id=${encodeURIComponent(spreadId)}`;
    }

    let readings = [];
    try {
      readings = await fetchJson(`./data/readings/${encodeURIComponent(spreadId)}/index.json`);
    } catch (err) {
      readings = [];
    }

    if (!readings.length) {
      readingListEl.innerHTML = `<div class="empty-state">아직 기록된 리딩이 없습니다.</div>`;
    } else {
      readingListEl.innerHTML = readings
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map(
          (r) => `
          <a class="list-card" href="./reading.html?spread=${encodeURIComponent(spreadId)}&id=${encodeURIComponent(r.id)}">
            <p class="list-card-title">${formatDate(r.date)}${r.title ? " — " + escapeHtml(r.title) : ""}</p>
          </a>
        `
        )
        .join("");
    }
  } catch (err) {
    renderError(headerEl, "스프레드를 불러오지 못했습니다: " + err.message);
  }
})();
