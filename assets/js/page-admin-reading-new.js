(function () {
  if (!isAdminLoggedIn()) {
    window.location.href = "./login.html";
    return;
  }

  const spreadId = qs("spread");
  const readingId = qs("id");
  const isEditMode = Boolean(readingId);

  const breadcrumbEl = document.getElementById("breadcrumb");
  const pageTitleEl = document.getElementById("page-title");
  const summaryEl = document.getElementById("spread-summary");
  const cardsEditor = document.getElementById("cards-editor");
  const randomAllBtn = document.getElementById("random-all-btn");
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

  if (isEditMode) {
    pageTitleEl.textContent = "리딩 수정";
    submitBtn.textContent = "수정 내용 저장";
  }

  breadcrumbEl.innerHTML = isEditMode
    ? `
    <a href="../index.html">스프레드 목록</a> /
    <a href="../spread.html?id=${encodeURIComponent(spreadId)}">스프레드 상세</a> /
    <a href="../reading.html?spread=${encodeURIComponent(spreadId)}&id=${encodeURIComponent(readingId)}">리딩 상세</a> /
  `
    : `
    <a href="../index.html">스프레드 목록</a> /
    <a href="../spread.html?id=${encodeURIComponent(spreadId)}">스프레드 상세</a> /
  `;

  // 오늘 날짜를 기본값으로 (수정 모드에서는 아래에서 기존 값으로 덮어씀)
  const today = new Date();
  dateInput.value = today.toISOString().slice(0, 10);

  let spread = null;
  let existingReading = null;
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
            <button type="button" class="btn btn-secondary dice-btn" title="이 자리만 랜덤으로 다시 뽑기">🎲</button>
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
    randomAllBtn.disabled = false;
  }

  function prefillFromExistingReading() {
    dateInput.value = existingReading.date;
    document.getElementById("title-input").value = existingReading.title || "";

    const cc = existingReading.characterContext;
    document.getElementById("character-name-input").value = cc?.name || "";
    document.getElementById("character-info-input").value = cc?.info || "";
    document.getElementById("character-situation-input").value = cc?.situation || "";

    document.getElementById("overall-input").value = existingReading.overallInterpretation || "";
    document.getElementById("reader-note-input").value = existingReading.readerNote || "";

    const cardsByOrder = new Map((existingReading.cards || []).map((c) => [c.order, c]));
    cardsEditor.querySelectorAll(".card-row").forEach((row) => {
      const order = Number(row.dataset.order);
      const existingCard = cardsByOrder.get(order);
      if (!existingCard) return;
      row.querySelector(".card-select").value = existingCard.card || "";
      row.querySelector(".orientation-select").value = existingCard.orientation || "upright";
      row.querySelector(".card-ai-textarea").value = existingCard.aiInterpretation || "";
    });

    if ((existingReading.cards || []).some((c) => c.aiInterpretation)) {
      hasGeneratedOnce = true;
      aiBtn.textContent = "🔄 다시 생성 (Gemini 재리딩)";
    }
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

  // 실물 카드가 없을 때를 위한 랜덤 뽑기. excludeCards에 있는 카드는 제외해 같은 리딩 안에서 중복되지 않게 한다.
  function drawRandomCards(count, excludeCards) {
    const pool = TAROT_CARDS.filter((c) => !excludeCards.includes(c));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count).map((card) => ({
      card,
      orientation: Math.random() < 0.5 ? "reversed" : "upright",
    }));
  }

  cardsEditor.addEventListener("click", function (e) {
    const diceBtn = e.target.closest(".dice-btn");
    if (!diceBtn) return;
    const row = diceBtn.closest(".card-row");
    const otherRows = Array.from(cardsEditor.querySelectorAll(".card-row")).filter((r) => r !== row);
    const usedElsewhere = otherRows.map((r) => r.querySelector(".card-select").value).filter(Boolean);
    const [drawn] = drawRandomCards(1, usedElsewhere);
    if (!drawn) return;
    row.querySelector(".card-select").value = drawn.card;
    row.querySelector(".orientation-select").value = drawn.orientation;
  });

  randomAllBtn.addEventListener("click", function () {
    const rows = collectCardRows();
    const alreadyChosen = rows.some((r) => r.card);
    if (alreadyChosen) {
      const confirmed = window.confirm("이미 선택된 카드가 있습니다. 전체를 새로 랜덤 뽑기하면 모두 덮어씁니다. 계속할까요?");
      if (!confirmed) return;
    }
    const drawn = drawRandomCards(rows.length, []);
    const rowEls = Array.from(cardsEditor.querySelectorAll(".card-row"));
    rowEls.forEach((row, i) => {
      row.querySelector(".card-select").value = drawn[i].card;
      row.querySelector(".orientation-select").value = drawn[i].orientation;
    });
  });

  (async function load() {
    try {
      const { json } = await ghGetJsonFile(`data/spreads/${spreadId}.json`);
      if (!json) throw new Error("스프레드를 찾을 수 없습니다.");
      spread = json;
      const displayName = spread.customName || spread.question;
      document.title = `${isEditMode ? "리딩 수정" : "리딩 추가"} · ${displayName}`;
      summaryEl.textContent = isEditMode
        ? `"${displayName}" 스프레드의 리딩을 수정합니다.`
        : `"${displayName}" 스프레드에 새 리딩을 기록합니다.`;
      renderCardsEditor();

      if (isEditMode) {
        const { json: readingJson } = await ghGetJsonFile(`data/readings/${spreadId}/${readingId}.json`);
        if (!readingJson) throw new Error("수정할 리딩을 찾을 수 없습니다.");
        existingReading = readingJson;
        prefillFromExistingReading();
      }
    } catch (err) {
      summaryEl.textContent = "";
      alertEl.innerHTML = `<div class="alert alert-error">${isEditMode ? "리딩" : "스프레드"}을 불러오지 못했습니다: ${escapeHtml(err.message)}</div>`;
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
          spreadDescription: spread.description || null,
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
    submitBtn.textContent = isEditMode ? "저장 중..." : "저장 중...";

    const cards = rows.map((r) => ({
      order: r.order,
      card: r.card,
      orientation: r.orientation,
      positionLabel: r.positionLabel,
      positionMeaning: r.positionMeaning,
      aiInterpretation: r.aiTextarea.value.trim(),
    }));

    try {
      if (isEditMode) {
        const updatedReading = {
          ...existingReading,
          date,
          title: title || null,
          characterContext,
          cards,
          overallInterpretation,
          readerNote,
          updatedAt: new Date().toISOString(),
          updatedBy: getAdminUser() || "admin",
        };

        await commitJsonFile(
          `data/readings/${spreadId}/${readingId}.json`,
          () => updatedReading,
          `리딩 수정: ${spreadId} / ${readingId}`
        );

        await commitJsonFile(
          `data/readings/${spreadId}/index.json`,
          function (current) {
            const list = current || [];
            return list.map((r) => (r.id === readingId ? { ...r, date, title: title || null } : r));
          },
          `리딩 목록 갱신 (수정): ${spreadId}`
        );

        await commitJsonFile(
          `data/spreads/index.json`,
          function (current) {
            const list = current || [];
            return list.map((s) => {
              if (s.id !== spreadId) return s;
              const latest = !s.latestReadingDate || date > s.latestReadingDate ? date : s.latestReadingDate;
              return { ...s, latestReadingDate: latest };
            });
          },
          `스프레드 목록 갱신 (리딩 수정): ${spreadId}`
        );
      } else {
        const { json: existingReadingsIndex } = await ghGetJsonFile(`data/readings/${spreadId}/index.json`);
        const newReadingId = nextAvailableReadingId(existingReadingsIndex, date);
        const createdAt = new Date().toISOString();
        const createdBy = getAdminUser() || "admin";

        const reading = {
          id: newReadingId,
          spreadId,
          date,
          title: title || null,
          characterContext,
          cards,
          overallInterpretation,
          readerNote,
          createdAt,
          createdBy,
        };

        await commitJsonFile(
          `data/readings/${spreadId}/${newReadingId}.json`,
          () => reading,
          `새 리딩 추가: ${spreadId} / ${newReadingId}`
        );

        await commitJsonFile(
          `data/readings/${spreadId}/index.json`,
          function (current) {
            const list = current || [];
            list.push({ id: newReadingId, date, title: title || null, createdAt });
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

        window.location.href = `../reading.html?spread=${encodeURIComponent(spreadId)}&id=${encodeURIComponent(newReadingId)}`;
        return;
      }

      window.location.href = `../reading.html?spread=${encodeURIComponent(spreadId)}&id=${encodeURIComponent(readingId)}`;
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">저장에 실패했습니다: ${escapeHtml(err.message)}</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = isEditMode ? "수정 내용 저장" : "리딩 저장";
    }
  });
})();
