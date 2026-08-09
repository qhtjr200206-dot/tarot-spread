(function () {
  if (!isAdminLoggedIn()) {
    window.location.href = "./login.html";
    return;
  }

  const spreadId = qs("id");
  const isEditMode = Boolean(spreadId);

  const breadcrumbEl = document.getElementById("breadcrumb");
  const pageTitleEl = document.getElementById("page-title");
  const editorEl = document.getElementById("positions-editor");
  const addBtn = document.getElementById("add-position-btn");
  const form = document.getElementById("spread-form");
  const alertEl = document.getElementById("form-alert");
  const submitBtn = document.getElementById("submit-btn");

  let existingSpread = null;

  if (isEditMode) {
    pageTitleEl.textContent = "스프레드 수정";
    submitBtn.textContent = "수정 내용 저장";
    breadcrumbEl.innerHTML = `
      <a href="../index.html">스프레드 목록</a> /
      <a href="../spread.html?id=${encodeURIComponent(spreadId)}">스프레드 상세</a> /
    `;
  }

  function addPositionRow(label, meaning) {
    const row = document.createElement("div");
    row.className = "position-row";
    row.innerHTML = `
      <span class="order-badge"></span>
      <input type="text" class="position-label" placeholder="자리 이름 (예: 성격)" value="${escapeHtml(label || "")}" required />
      <input type="text" class="position-meaning" placeholder="이 자리의 의미" value="${escapeHtml(meaning || "")}" required />
      <button type="button" class="remove-row-btn" title="이 자리 삭제">✕</button>
    `;
    row.querySelector(".remove-row-btn").addEventListener("click", function () {
      row.remove();
      renumberPositions();
    });
    editorEl.appendChild(row);
    renumberPositions();
  }

  function renumberPositions() {
    editorEl.querySelectorAll(".position-row").forEach(function (row, idx) {
      row.querySelector(".order-badge").textContent = String(idx + 1);
    });
  }

  addBtn.addEventListener("click", () => addPositionRow());

  function collectPositions() {
    const rows = Array.from(editorEl.querySelectorAll(".position-row"));
    return rows.map(function (row, idx) {
      return {
        order: idx + 1,
        label: row.querySelector(".position-label").value.trim(),
        meaning: row.querySelector(".position-meaning").value.trim(),
      };
    });
  }

  function makeSpreadId() {
    return `spread-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  (async function init() {
    if (!isEditMode) {
      // 새 스프레드: 기본 2개 자리로 시작
      addPositionRow();
      addPositionRow();
      return;
    }

    try {
      const { json } = await ghGetJsonFile(`data/spreads/${spreadId}.json`);
      if (!json) throw new Error("스프레드를 찾을 수 없습니다.");
      existingSpread = json;

      document.title = `스프레드 수정 · ${existingSpread.customName || existingSpread.question}`;
      document.getElementById("question-input").value = existingSpread.question || "";
      document.getElementById("custom-name-input").value = existingSpread.customName || "";
      document.getElementById("description-input").value = existingSpread.description || "";

      const positions = (existingSpread.positions || []).slice().sort((a, b) => a.order - b.order);
      positions.forEach((p) => addPositionRow(p.label, p.meaning));
      if (positions.length === 0) {
        addPositionRow();
        addPositionRow();
      }
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">스프레드를 불러오지 못했습니다: ${escapeHtml(err.message)}</div>`;
    }
  })();

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    alertEl.innerHTML = "";

    const question = document.getElementById("question-input").value.trim();
    const customName = document.getElementById("custom-name-input").value.trim();
    const description = document.getElementById("description-input").value.trim();
    const positions = collectPositions();

    if (!question) {
      alertEl.innerHTML = `<div class="alert alert-error">질문을 입력해주세요.</div>`;
      return;
    }
    if (positions.length === 0 || positions.some((p) => !p.label || !p.meaning)) {
      alertEl.innerHTML = `<div class="alert alert-error">자리별 이름과 의미를 모두 입력해주세요.</div>`;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "저장 중...";

    try {
      if (isEditMode) {
        const updatedSpread = {
          ...existingSpread,
          question,
          customName: customName || null,
          description: description || "",
          positions,
          updatedAt: new Date().toISOString(),
          updatedBy: getAdminUser() || "admin",
        };

        await commitJsonFile(
          `data/spreads/${spreadId}.json`,
          () => updatedSpread,
          `스프레드 수정: ${question}`
        );

        await commitJsonFile(
          `data/spreads/index.json`,
          function (current) {
            const list = current || [];
            return list.map((s) =>
              s.id === spreadId
                ? { ...s, question, customName: customName || null, positionCount: positions.length }
                : s
            );
          },
          `스프레드 목록 갱신 (수정): ${question}`
        );

        window.location.href = `../spread.html?id=${encodeURIComponent(spreadId)}`;
        return;
      }

      const id = makeSpreadId();
      const createdAt = new Date().toISOString();
      const createdBy = getAdminUser() || "admin";

      const spread = {
        id,
        question,
        customName: customName || null,
        description: description || "",
        positions,
        createdAt,
        createdBy,
      };

      await commitJsonFile(`data/spreads/${id}.json`, () => spread, `새 스프레드 추가: ${question}`);

      await commitJsonFile(
        `data/spreads/index.json`,
        function (current) {
          const list = current || [];
          list.push({
            id,
            question,
            customName: customName || null,
            positionCount: positions.length,
            readingCount: 0,
            latestReadingDate: null,
            createdAt,
          });
          return list;
        },
        `스프레드 목록 갱신: ${question}`
      );

      window.location.href = `../spread.html?id=${encodeURIComponent(id)}`;
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">저장에 실패했습니다: ${escapeHtml(err.message)}</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = isEditMode ? "수정 내용 저장" : "스프레드 저장";
    }
  });
})();
