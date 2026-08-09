(async function () {
  const spreadId = qs("spread");
  const readingId = qs("id");
  const breadcrumbEl = document.getElementById("breadcrumb");
  const headerEl = document.getElementById("reading-header");
  const cardsWrap = document.getElementById("cards-table-wrap");
  const overallEl = document.getElementById("overall-interpretation");
  const noteEl = document.getElementById("reader-note");
  const editLink = document.getElementById("edit-reading-link");

  if (!spreadId || !readingId) {
    renderError(headerEl, "스프레드 또는 리딩 id가 없습니다.");
    return;
  }

  breadcrumbEl.innerHTML = `
    <a href="./index.html">스프레드 목록</a> /
    <a href="./spread.html?id=${encodeURIComponent(spreadId)}">스프레드 상세</a> /
  `;

  if (editLink) {
    editLink.href = `./admin/reading-new.html?spread=${encodeURIComponent(spreadId)}&id=${encodeURIComponent(readingId)}`;
  }

  try {
    const [spread, reading] = await Promise.all([
      fetchJson(`./data/spreads/${encodeURIComponent(spreadId)}.json`).catch(() => null),
      fetchJson(`./data/readings/${encodeURIComponent(spreadId)}/${encodeURIComponent(readingId)}.json`),
    ]);

    const spreadName = spread ? spread.customName || spread.question : spreadId;
    document.title = `${formatDate(reading.date)} 리딩 · ${spreadName}`;

    headerEl.innerHTML = `
      <h1 class="page-title">${escapeHtml(spreadName)}</h1>
      <p class="page-subtitle">${formatDate(reading.date)}${reading.title ? " — " + escapeHtml(reading.title) : ""} 리딩</p>
    `;

    const cards = (reading.cards || []).slice().sort((a, b) => a.order - b.order);
    cardsWrap.innerHTML = `
      <table class="cards-table">
        <thead>
          <tr><th>순서</th><th>자리 의미</th><th>카드</th><th>AI 해석</th></tr>
        </thead>
        <tbody>
          ${cards
            .map(
              (c) => `
            <tr>
              <td><span class="order-badge">${c.order}</span></td>
              <td>${escapeHtml(c.positionLabel)}</td>
              <td><strong>${escapeHtml(c.card)}</strong> ${c.orientation === "reversed" ? "(역방향)" : "(정방향)"}</td>
              <td>${escapeHtml(c.aiInterpretation || "")}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    overallEl.textContent = reading.overallInterpretation || "(작성되지 않음)";
    noteEl.textContent = reading.readerNote || "(작성되지 않음)";
  } catch (err) {
    renderError(headerEl, "리딩을 불러오지 못했습니다: " + err.message);
  }
})();
