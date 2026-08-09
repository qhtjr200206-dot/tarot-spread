(function () {
  if (!isAdminLoggedIn()) {
    window.location.href = "./login.html";
    return;
  }

  const spreadId = qs("spread");
  const breadcrumbEl = document.getElementById("breadcrumb");
  const summaryEl = document.getElementById("spread-summary");
  const cardsEditor = document.getElementById("cards-editor");
  const aiBtn = document.getElementById("ai-interpret-btn");
  const aiStatus = document.getElementById("ai-status");
  const submitBtn = document.getElementById("submit-btn");
  const alertEl = document.getElementById("form-alert");
  const form = document.getElementById("reading-form");
  const dateInput = document.getElementById("date-input");

  if (!spreadId) {
    summaryEl.textContent = "";
    alertEl.innerHTML = `<div class="alert alert-error">스프레드 id가 없습니다. 스프레드 상세 페이지에서 다시 시도해주세요.</div>`;
    return;
  }

  breadcrumbEl.innerHTML = `
    <a href="../index.html">스프레드 목록</a> /
    <a href="../spread.html?id=${encodeURIComponent(spreadId)}">스프레드 상세</a> /
  `;

  // 오늘 날짜를 기본값으로
  const today = new Date();
  dateInput.value = today.toISOString().slice(0, 10);

  let spread = null;
  let hasGeneratedOnce = false;

  function cardOptionsHtml() {
    return (
      `<option value="">카드 선택...</option>` +
      TAROT_CARD_GROUPS.map(
        (group) =>
          `<optgroup label="${escapeHtml(group.label)}">` +
          group.cards.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("") +
          `</optgroup>`
      ).join("")
    );
  }

  function renderCardsEditor() {
    const positions = (spread.positions || []).slice().sort((a, b) => a.order - b.order);
    cardsEditor.innerHTML = positions
      .map(
        (p) => `
        <div class="card-row" data-order="${p.order}" data-label="${escapeHtml(p.label)}" data-meaning="${escapeHtml(p.meaning)}">
          <div class="card-row-heading"><span class="order-badge">${p.order}</span> ${escapeHtml(p.label)}</div>
          <p class="form-hint">${escapeHtml(p.meaning)}</p>
          <div class="inline-fields">
            <select class="card-select" required>${cardOptionsHtml()}</select>
            <select class="orientation-select">
              <option value="upright">정방향</option>
              <option value="reversed">역방향</option>
            </select>
          </div>
          <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
            <label>이 자리의 AI 해석</label>
            <textarea class="card-ai-textarea" placeholder="AI 해석 생성 버튼을 누르면 채워지며, 자유롭게 수정할 수 있습니다."></textarea>
          </div>
        </div>
      `
      )
      .join("");
    aiBtn.disabled = false;
    submitBtn.disabled = false;
  }

  function collectCardRows() {
    return Array.from(cardsEditor.querySelectorAll(".card-row")).map((row) => ({
      order: Number(row.dataset.order),
      positionLabel: row.dataset.label,
      positionMeaning: row.dataset.meaning,
      card: row.querySelector(".card-select").value,
      orientation: row.querySelector(".orientation-select").value,
      aiTextarea: row.querySelector(".card-ai-textarea"),
    }));
  }

  function collectCharacterContext() {
    const name = document.getElementById("character-name-input").value.trim();
    const info = document.getElementById("character-info-input").value.trim();
    const situation = document.getElementById("character-situation-input").value.trim();
    if (!name && !info && !situation) return null;
    return { name: name || null, info: info || null, situation: situation || null };
  }

  (async function loadSpread() {
    try {
      const { json } = await ghGetJsonFile(`data/spreads/${spreadId}.json`);
      if (!json) throw new Error("스프레드를 찾을 수 없습니다.");
      spread = json;
      const displayName = spread.customName || spread.question;
      document.title = `리딩 추가 · ${displayName}`;
      summaryEl.textContent = `"${displayName}" 스프레드에 새 리딩을 기록합니다.`;
      renderCardsEditor();
    } catch (err) {
      summaryEl.textContent = "";
      alertEl.innerHTML = `<div class="alert alert-error">스프레드를 불러오지 못했습니다: ${escapeHtml(err.message)}</div>`;
    }
  })();

  aiBtn.addEventListener("click", async function () {
    const rows = collectCardRows();
    if (rows.some((r) => !r.card)) {
      aiStatus.textContent = "AI 해석을 생성하려면 모든 자리에 카드를 먼저 선택해주세요.";
      return;
    }

    if (hasGeneratedOnce) {
      const confirmed = window.confirm("이미 작성된 AI 해석과 총합 해석을 새로 생성된 내용으로 덮어씁니다. 계속할까요?");
      if (!confirmed) return;
    }

    aiBtn.disabled = true;
    aiStatus.textContent = "요청을 저장소에 기록하는 중...";

    try {
      const result = await requestAiInterpretation(
        {
          spreadQuestion: spread.question,
          characterContext: collectCharacterContext(),
          positions: rows.map((r) => ({
            order: r.order,
            label: r.positionLabel,
            meaning: r.positionMeaning,
            card: r.card,
            orientation: r.orientation,
          })),
        },
        function (elapsedMs) {
          aiStatus.textContent = `GitHub Actions가 Gemini를 호출하는 중... (${Math.round(elapsedMs / 1000)}초 경과, 최대 2분 정도 걸릴 수 있어요)`;
        }
      );

      rows.forEach((r) => {
        const found = result.positions.find((p) => p.order === r.order);
        if (found) r.aiTextarea.value = found.interpretation;
      });
      document.getElementById("overall-input").value = result.overall;
      hasGeneratedOnce = true;
      aiBtn.textContent = "🔄 다시 생성 (Gemini 재리딩)";
      aiStatus.textContent = "AI 해석 초안이 채워졌습니다. 필요한 부분은 자유롭게 수정하세요.";
    } catch (err) {
      aiStatus.textContent = "AI 해석 생성 실패: " + err.message;
    } finally {
      aiBtn.disabled = false;
    }
  });

  function nextAvailableReadingId(existingIndex, baseId) {
    const ids = new Set((existingIndex || []).map((r) => r.id));
    if (!ids.has(baseId)) return baseId;
    let n = 2;
    while (ids.has(`${baseId}-${n}`)) n++;
    return `${baseId}-${n}`;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    alertEl.innerHTML = "";

    const date = dateInput.value;
    const title = document.getElementById("title-input").value.trim();
    const overallInterpretation = document.getElementById("overall-input").value.trim();
    const readerNote = document.getElementById("reader-note-input").value.trim();
    const characterContext = collectCharacterContext();
    const rows = collectCardRows();

    if (!date) {
      alertEl.innerHTML = `<div class="alert alert-error">리딩 날짜를 선택해주세요.</div>`;
      return;
    }
    if (rows.some((r) => !r.card)) {
      alertEl.innerHTML = `<div class="alert alert-error">모든 자리에 카드를 선택해주세요.</div>`;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "저장 중...";

    try {
      const { json: existingReadingsIndex } = await ghGetJsonFile(`data/readings/${spreadId}/index.json`);
      const readingId = nextAvailableReadingId(existingReadingsIndex, date);
      const createdAt = new Date().toISOString();
      const createdBy = getAdminUser() || "admin";

      const reading = {
        id: readingId,
        spreadId,
        date,
        title: title || null,
        characterContext,
        cards: rows.map((r) => ({
          order: r.order,
          card: r.card,
          orientation: r.orientation,
          positionLabel: r.positionLabel,
          positionMeaning: r.positionMeaning,
          aiInterpretation: r.aiTextarea.value.trim(),
        })),
        overallInterpretation,
        readerNote,
        createdAt,
        createdBy,
      };

      await commitJsonFile(
        `data/readings/${spreadId}/${readingId}.json`,
        () => reading,
        `새 리딩 추가: ${spreadId} / ${readingId}`
      );

      await commitJsonFile(
        `data/readings/${spreadId}/index.json`,
        function (current) {
          const list = current || [];
          list.push({ id: readingId, date, title: title || null, createdAt });
          return list;
        },
        `리딩 목록 갱신: ${spreadId}`
      );

      await commitJsonFile(
        `data/spreads/index.json`,
        function (current) {
          const list = current || [];
          return list.map((s) => {
            if (s.id !== spreadId) return s;
            const latest = !s.latestReadingDate || date > s.latestReadingDate ? date : s.latestReadingDate;
            return { ...s, readingCount: (s.readingCount || 0) + 1, latestReadingDate: latest };
          });
        },
        `스프레드 목록의 리딩 수 갱신: ${spreadId}`
      );

      window.location.href = `../reading.html?spread=${encodeURIComponent(spreadId)}&id=${encodeURIComponent(readingId)}`;
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">저장에 실패했습니다: ${escapeHtml(err.message)}</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = "리딩 저장";
    }
  });
})();
