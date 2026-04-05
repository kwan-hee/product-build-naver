const EXAMPLE_TEXT = `국내 여러 기업이 최근 AI 업무 도구를 빠르게 도입하면서, 실무 현장에서는 생산성 향상과 운영 효율화에 대한 기대가 커지고 있습니다. 특히 문서 요약, 회의록 정리, 고객 문의 초안 작성처럼 반복적인 업무에서 AI 활용도가 높아지고 있다는 점이 눈에 띕니다.

한편 현장에서는 정확도와 보안, 실제 업무 적용 범위에 대한 점검도 함께 이루어지고 있습니다. 단순히 기능이 많다고 해서 바로 도입하기보다는, 어떤 팀이 어떤 업무에 먼저 적용할지 구체적으로 설계하는 과정이 중요하다는 의견도 나옵니다.

결국 이번 흐름은 AI 자체의 화제성보다도, 실제 업무에 어떻게 연결하고 운영 기준을 어떻게 세울 것인지가 더 중요한 포인트로 보입니다. 도입 속도와 함께 활용 원칙을 정리하는 기업이 앞으로 더 안정적인 성과를 낼 가능성이 높아 보입니다.`;

const STYLE_GUIDES = {
  informative: { label: "정보형" },
  review: { label: "후기형" },
  soft: { label: "부드러운 설명형" },
};

const sourceText = document.querySelector("#sourceText");
const charCount = document.querySelector("#charCount");
const statusText = document.querySelector("#statusText");
const titlesList = document.querySelector("#titlesList");
const introOutput = document.querySelector("#introOutput");
const bodyOutput = document.querySelector("#bodyOutput");
const conclusionOutput = document.querySelector("#conclusionOutput");
const tagsOutput = document.querySelector("#tagsOutput");
const finalPostOutput = document.querySelector("#finalPostOutput");
const copyAllButton = document.querySelector("#copyAllButton");
const copyPostButton = document.querySelector("#copyPostButton");
const toast = document.querySelector("#toast");

const fillExampleButton = document.querySelector("#fillExampleButton");
const generateAllButton = document.querySelector("#generateAllButton");
const generateTitlesButton = document.querySelector("#generateTitlesButton");
const generateIntroButton = document.querySelector("#generateIntroButton");
const generateBodyButton = document.querySelector("#generateBodyButton");
const generateConclusionButton = document.querySelector("#generateConclusionButton");
const generateTagsButton = document.querySelector("#generateTagsButton");
const resetButton = document.querySelector("#resetButton");
const toneInputs = [...document.querySelectorAll("input[name='tone']")];
const generationButtons = [
  generateAllButton,
  generateTitlesButton,
  generateIntroButton,
  generateBodyButton,
  generateConclusionButton,
  generateTagsButton,
];
const controlButtons = [fillExampleButton, resetButton, ...generationButtons];

const state = {
  titles: [],
  selectedTitleIndex: null,
  intro: "",
  body: "",
  conclusion: "",
  tags: [],
  finalPost: "",
  requestPending: false,
};

let toastTimer = null;

function getSelectedTone() {
  const checked = document.querySelector("input[name='tone']:checked");
  return checked ? checked.value : "informative";
}

function hasMeaningfulInput() {
  return sourceText.value.trim().length > 0;
}

function setStatus(message) {
  statusText.textContent = message;
}

function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 2200);
}

function updateCharCount() {
  charCount.textContent = `${sourceText.value.length.toLocaleString("ko-KR")}자`;
}

function getSelectedTitle() {
  if (state.selectedTitleIndex === null) {
    return "";
  }

  return state.titles[state.selectedTitleIndex] || "";
}

function buildFinalPost() {
  const title = getSelectedTitle();

  if (!title || !state.intro || !state.body || !state.conclusion || !state.tags.length) {
    state.finalPost = "";
    return;
  }

  state.finalPost = [
    title,
    "",
    state.intro,
    "",
    state.body,
    "",
    "마무리",
    state.conclusion,
    "",
    state.tags.join(" "),
  ].join("\n");
}

function updateCopyButtons() {
  const hasAnyResult = Boolean(
    state.titles.length || state.intro || state.body || state.conclusion || state.tags.length,
  );

  copyAllButton.disabled = state.requestPending || !hasAnyResult;
  copyPostButton.disabled = state.requestPending || !state.finalPost;
}

function updateActionControls(activeButton = null) {
  controlButtons.forEach((button) => {
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent;
    }

    button.disabled = state.requestPending;
    button.textContent = button.dataset.defaultLabel;
  });

  toneInputs.forEach((input) => {
    input.disabled = state.requestPending;
  });

  if (state.requestPending && activeButton) {
    activeButton.disabled = true;
    activeButton.textContent = "생성 중...";
  }

  updateCopyButtons();
}

function renderFinalPost() {
  if (!state.finalPost) {
    finalPostOutput.className = "final-post-output empty";

    if (!state.titles.length) {
      finalPostOutput.value = "제목, 도입문, 본문, 결론, 해시태그를 생성하면 여기에 네이버 블로그 편집용 최종 원고가 정리됩니다.";
      return;
    }

    if (state.selectedTitleIndex === null) {
      finalPostOutput.value = "추천 제목이 생성되었습니다. 마음에 드는 제목을 하나 선택하면 최종 원고가 자연스럽게 조합됩니다.";
      return;
    }

    finalPostOutput.value = "도입문, 본문, 결론, 해시태그가 모두 있어야 최종 원고가 완성됩니다. 아직 생성되지 않은 항목을 채워 주세요.";
    return;
  }

  finalPostOutput.className = "final-post-output";
  finalPostOutput.value = state.finalPost;
}

function renderTitles(titles) {
  if (!titles.length) {
    titlesList.className = "title-list empty";
    titlesList.innerHTML = "<li>아직 생성된 제목이 없습니다.</li>";
    return;
  }

  titlesList.className = "title-list";
  titlesList.innerHTML = titles
    .map((title, index) => {
      const activeClass = index === state.selectedTitleIndex ? "active" : "";
      return `<li><button class="title-item-button ${activeClass}" type="button" data-title-index="${index}">${escapeHtml(title)}</button></li>`;
    })
    .join("");
}

function renderTextBlock(element, value, fallback) {
  if (!value) {
    element.className = `text-output${element.id === "bodyOutput" ? " rich-output" : ""} empty`;
    element.textContent = fallback;
    return;
  }

  element.className = element.id === "bodyOutput" ? "text-output rich-output" : "text-output";
  element.textContent = value;
}

function renderTags(tags) {
  if (!tags.length) {
    tagsOutput.className = "tag-output empty";
    tagsOutput.textContent = "아직 생성된 해시태그가 없습니다.";
    return;
  }

  tagsOutput.className = "tag-output";
  tagsOutput.innerHTML = tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("");
}

function renderAll() {
  renderTitles(state.titles);
  renderTextBlock(introOutput, state.intro, "도입문 생성 버튼을 누르면 여기에 결과가 표시됩니다.");
  renderTextBlock(bodyOutput, state.body, "본문 생성 버튼을 누르면 여기에 결과가 표시됩니다.");
  renderTextBlock(conclusionOutput, state.conclusion, "결론 생성 버튼을 누르면 여기에 결과가 표시됩니다.");
  renderTags(state.tags);
  buildFinalPost();
  renderFinalPost();
  updateActionControls();
}

function collectResultText() {
  return [
    "[네이버 블로그 편집용 최종 원고]",
    state.finalPost || "-",
    "",
    "[추천 제목]",
    state.titles.map((title, index) => `${index + 1}. ${title}`).join("\n") || "-",
    "",
    "[도입문]",
    state.intro || "-",
    "",
    "[본문]",
    state.body || "-",
    "",
    "[결론]",
    state.conclusion || "-",
    "",
    "[해시태그]",
    state.tags.join(" ") || "-",
  ].join("\n");
}

async function copyText(text, successMessage) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "true");
    helper.style.position = "absolute";
    helper.style.left = "-9999px";
    document.body.append(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  setStatus(successMessage);
  showToast(successMessage, "success");
}

function resetGeneratedState() {
  state.titles = [];
  state.selectedTitleIndex = null;
  state.intro = "";
  state.body = "";
  state.conclusion = "";
  state.tags = [];
  state.finalPost = "";
}

function resetApp() {
  sourceText.value = "";
  resetGeneratedState();
  document.querySelector("input[name='tone'][value='informative']").checked = true;
  updateCharCount();
  renderAll();
  setStatus("입력과 생성 결과를 모두 초기화했습니다.");
  showToast("입력과 생성 결과를 모두 초기화했습니다.", "success");
}

function fillExample({ silent = false } = {}) {
  sourceText.value = EXAMPLE_TEXT;
  updateCharCount();

  if (!silent) {
    setStatus("예시 데이터를 불러왔습니다. 원하는 스타일을 고른 뒤 생성해 보세요.");
    showToast("예시 데이터를 불러왔습니다.", "success");
  }
}

function ensureSourceText() {
  const text = sourceText.value.trim();
  if (text) {
    return text;
  }

  fillExample({ silent: true });
  setStatus("입력값이 비어 있어 예시 데이터를 자동으로 채웠습니다.");
  showToast("입력값이 없어서 예시 데이터를 자동으로 넣었습니다.", "warning");
  return sourceText.value.trim();
}

function normalizeTags(tags) {
  return tags
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .slice(0, 10);
}

function normalizeGenerationResult(result) {
  const titles = Array.isArray(result?.titles)
    ? result.titles.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
    : [];
  const intro = String(result?.intro || "").trim();
  const body = String(result?.body || "").trim();
  const conclusion = String(result?.conclusion || "").trim();
  const tags = Array.isArray(result?.tags) ? normalizeTags(result.tags) : [];

  if (titles.length !== 5 || tags.length !== 10 || !intro || !body || !conclusion) {
    throw new Error("생성 결과 형식이 올바르지 않습니다. 서버 응답을 확인해 주세요.");
  }

  return { titles, intro, body, conclusion, tags };
}

async function requestGeneration(text, tone, mode) {
  let response;

  try {
    const endpoint = mode === "titles" 
  ? "/generate-titles" 
  : "/generate";

    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sourceText: text, tone }),
    });
  } catch (error) {
    throw new Error("서버에 연결하지 못했습니다. server.js가 3001번 포트에서 실행 중인지 확인해 주세요.");
  }

  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`서버 응답을 해석하지 못했습니다. (Status: ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(payload?.error || `생성 요청이 실패했습니다. (Status: ${response.status})`);
  }

  if (mode === "titles") {
    if (!payload.titles || !Array.isArray(payload.titles) || payload.titles.length !== 5) {
        throw new Error("서버에서 받은 제목 데이터 형식이 올바르지 않습니다.");
    }
    return payload;
  } else {
    return normalizeGenerationResult(payload);
  }
}

function applyGeneratedResult(result, mode) {
  if (mode === "titles") {
    state.titles = result.titles;
    state.selectedTitleIndex = null;
    return;
  }

  if (mode === "intro") {
    state.intro = result.intro;
    return;
  }

  if (mode === "body") {
    state.body = result.body;
    return;
  }

  if (mode === "conclusion") {
    state.conclusion = result.conclusion;
    return;
  }

  if (mode === "tags") {
    state.tags = result.tags;
    return;
  }

  state.titles = result.titles;
  state.selectedTitleIndex = null;
  state.intro = result.intro;
  state.body = result.body;
  state.conclusion = result.conclusion;
  state.tags = result.tags;
}

function getSuccessMessage(mode, tone) {
  if (mode === "titles") {
    return {
      status: "추천 제목 5개를 생성했습니다. 원하는 제목을 눌러 최종 원고 기준 제목으로 바꿀 수 있습니다.",
      toast: "제목 5개를 생성했습니다. 이제 제목을 하나 선택해 주세요.",
    };
  }

  if (mode === "intro") {
    return { status: "도입문을 생성했습니다.", toast: "도입문을 생성했습니다." };
  }

  if (mode === "body") {
    return { status: "본문을 생성했습니다.", toast: "본문을 생성했습니다." };
  }

  if (mode === "conclusion") {
    return { status: "결론을 생성했습니다.", toast: "결론을 생성했습니다." };
  }

  if (mode === "tags") {
    return { status: "해시태그 10개를 생성했습니다.", toast: "해시태그를 생성했습니다." };
  }

  return {
    status: `${STYLE_GUIDES[tone].label} 스타일로 전체 결과를 생성했습니다. 마지막으로 제목을 선택하면 최종 원고가 완성됩니다.`,
    toast: "전체 초안을 만들었습니다. 제목을 선택하면 최종 원고가 완성됩니다.",
  };
}

async function runGeneration(mode, button) {
  const text = ensureSourceText();
  const tone = getSelectedTone();
  const originalStatus = statusText.textContent;

  state.requestPending = true;
  updateActionControls(button);
  setStatus("OpenAI API로 초안을 생성하고 있습니다.");

  try { 
    const result = await requestGeneration(text, tone,mode);
    applyGeneratedResult(result, mode);
    renderAll();

    const message = getSuccessMessage(mode, tone);
    setStatus(message.status);
    showToast(message.toast, "success");
  } catch (error) {
    renderAll();
    setStatus(error.message || originalStatus || "생성 중 오류가 발생했습니다.");
    showToast(error.message || "생성 중 오류가 발생했습니다.", "error");
  } finally {
    state.requestPending = false;
    updateActionControls();
  }
}

function handleTitleSelection(event) {
  const button = event.target.closest("[data-title-index]");
  if (!button) {
    return;
  }

  state.selectedTitleIndex = Number(button.dataset.titleIndex);
  renderAll();
  setStatus("선택한 제목 기준으로 최종 원고를 다시 정리했습니다.");
  showToast("선택한 제목으로 최종 원고를 조합했습니다.", "success");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

sourceText.addEventListener("input", () => {
  updateCharCount();

  if (!hasMeaningfulInput()) {
    setStatus("예시 데이터를 불러오거나 직접 입력한 뒤 생성 버튼을 눌러 주세요.");
  }
});

fillExampleButton.addEventListener("click", () => fillExample());
generateAllButton.addEventListener("click", () => runGeneration("all", generateAllButton));
generateTitlesButton.addEventListener("click", () => runGeneration("titles", generateTitlesButton));
generateIntroButton.addEventListener("click", () => runGeneration("intro", generateIntroButton));
generateBodyButton.addEventListener("click", () => runGeneration("body", generateBodyButton));
generateConclusionButton.addEventListener("click", () => runGeneration("conclusion", generateConclusionButton));
generateTagsButton.addEventListener("click", () => runGeneration("tags", generateTagsButton));

copyAllButton.addEventListener("click", async () => {
  if (copyAllButton.disabled) {
    showToast("복사할 결과가 아직 없습니다.", "warning");
    return;
  }

  try {
    await copyText(collectResultText(), "전체 결과를 클립보드에 복사했습니다.");
  } catch (error) {
    setStatus("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    showToast("클립보드 복사에 실패했습니다.", "error");
  }
});

copyPostButton.addEventListener("click", async () => {
  if (!state.finalPost) {
    showToast("최종 원고가 아직 완성되지 않았습니다. 제목 선택과 생성 상태를 확인해 주세요.", "warning");
    return;
  }

  try {
    await copyText(state.finalPost, "최종 원고를 클립보드에 복사했습니다.");
  } catch (error) {
    setStatus("클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    showToast("클립보드 복사에 실패했습니다.", "error");
  }
});

resetButton.addEventListener("click", resetApp);
titlesList.addEventListener("click", handleTitleSelection);

toneInputs.forEach((radio) => {
  radio.addEventListener("change", () => {
    setStatus(`${STYLE_GUIDES[getSelectedTone()].label} 스타일을 선택했습니다.`);
    showToast(`${STYLE_GUIDES[getSelectedTone()].label} 스타일로 변경했습니다.`, "success");
  });
});

fillExample({ silent: true });
setStatus("예시 데이터가 기본으로 채워져 있습니다. 서버를 실행한 뒤 생성 버튼을 눌러 주세요.");
updateCharCount();
renderAll();
