import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import cors from "cors";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 3001;
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-0";
const validTones = new Set(["informative", "review", "soft"]);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "요청 본문이 비어 있습니다.";
  }

  if (!payload.sourceText || !payload.sourceText.trim()) {
    return "기사 원문 또는 메모를 입력해 주세요.";
  }

  if (!payload.tone || !validTones.has(payload.tone)) {
    return "유효한 말투 스타일을 선택해 주세요.";
  }

  return null;
}

function buildPrompt({ sourceText, tone }) {
  const toneMap = {
    informative: "정보형. 담백하고 정리 중심의 네이버 블로그 톤.",
    review: "후기형. 직접 경험을 정리한 듯 자연스럽고 생활형인 네이버 블로그 톤.",
    soft: "부드러운 설명형. 차분하고 친절하게 이해를 돕는 네이버 블로그 톤.",
  };

  return `
  너는 네이버 블로그 상위노출을 전문으로 하는 콘텐츠 작가다.

[목표]
- 네이버 블로그 SEO 최적화 글 작성
- 사람이 쓴 것처럼 자연스럽게라.

스타일:
${toneMap[tone]}

[구조]
- 제목 5개 (클릭 유도형)
- 도입문 (공감 + 문제 제기)
- 소제목 3~5개 포함 본문
- 결론 (정리 + 행동 유도)
- 해시태그 10개

반환 스키마:
{
  "titles": ["제목1", "제목2", "제목3", "제목4", "제목5"],
  "intro": "도입문",
  "body": "본문",
  "conclusion": "결론",
  "tags": ["#태그1", "#태그2", "#태그3", "#태그4", "#태그5", "#태그6", "#태그7", "#태그8", "#태그9", "#태그10"]
}

[작성 규칙]
- 반드시 JSON만 반환
- titles는 정확히 5개
- tags는 정확히 10개
- 자연스럽고 사람처럼 작성
- 줄바꿈을 적절히 사용 (가독성 중요)
- 중요한 키워드는 자연스럽게 반복
- AI 느낌 금지

원문:
${sourceText}`;
}

function buildTitleOnlyPrompt({ sourceText, tone }) {
  const toneMap = {
    informative: "정보형. 담백하고 정리 중심의 네이버 블로그 톤.",
    review: "후기형. 직접 경험을 정리한 듯 자연스럽고 생활형인 네이버 블로그 톤.",
    soft: "부드러운 설명형. 차분하고 친절하게 이해를 돕는 네이버 블로그 톤.",
  };

  return `
너는 네이버 블로그 제목 전문 카피라이터다.

목표:
- 검색 유입과 클릭을 동시에 노릴 수 있는 제목 작성
- 과장 없이 자연스럽고 사람이 클릭하고 싶게 만들기
- 네이버 블로그 스타일에 맞게 만들기

스타일:
${toneMap[tone]}

반환 스키마:
{
  "titles": ["제목1", "제목2", "제목3", "제목4", "제목5"]
}

작성 규칙:
- 반드시 JSON만 반환
- titles는 정확히 5개
- 제목마다 길이와 표현을 조금씩 다르게 작성
- 너무 자극적인 낚시 표현 금지
- 핵심 키워드를 자연스럽게 포함
- 검색에서 많이 찾을 표현을 우선 고려
- 클릭하고 싶게 만들되 과장 금지
- 한국어로만 작성

원문:
${sourceText}
`;
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일을 확인해 주세요.");
  }

  return new Anthropic({ apiKey });
}

async function callClaude(prompt) {
  const anthropic = getAnthropicClient();

  return anthropic.messages.create({
    model,
    max_tokens: 1800,
    system: "당신은 한국어 네이버 블로그 전문 편집자다. 사용자가 제공한 텍스트를 바탕으로 바로 게시 가능한 블로그 초안을 구조화해 작성한다. 응답은 반드시 JSON만 반환한다.",
    messages: [{ role: "user", content: prompt }],
  });
}

function extractOutputText(message) {
  if (!Array.isArray(message.content)) {
    throw new Error("Claude 응답 형식이 예상과 다릅니다.");
  }

  const text = message.content
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Claude 응답에서 텍스트를 추출하지 못했습니다.");
  }

  return text;
}

function parseModelJson(text) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.titles) || parsed.titles.length !== 5) {
    throw new Error("응답의 titles 형식이 올바르지 않습니다.");
  }

  
  if (!Array.isArray(parsed.tags) || parsed.tags.length !== 10) {
    throw new Error("응답의 tags 형식이 올바르지 않습니다.");
  }

  const result = {
    titles: parsed.titles.map((item) => String(item).trim()).filter(Boolean),
    intro: String(parsed.intro || "").trim(),
    body: String(parsed.body || "").trim(),
    conclusion: String(parsed.conclusion || "").trim(),
    tags: parsed.tags.map((item) => String(item).trim()).filter(Boolean),
  };

  if (
    result.titles.length !== 5 ||
    result.tags.length !== 10 ||
    !result.intro ||
    !result.body ||
    !result.conclusion
  ) {
    throw new Error("응답 JSON에 필요한 값이 누락되었습니다.");
  }

  return result;
}

function parseTitlesOnlyJson(text) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.titles) || parsed.titles.length !== 5) {
    throw new Error("응답의 titles 형식이 올바르지 않습니다.");
  }

  const titles = parsed.titles
    .map((item) => String(item).trim())
    .filter(Boolean);

  if (titles.length !== 5) {
    throw new Error("제목 5개가 정확히 생성되지 않았습니다.");
  }

  return { titles };
}


app.post("/generate", async (req, res) => {
  const errorMessage = validatePayload(req.body);
  if (errorMessage) {
    return res.status(400).json({ error: errorMessage });
  }

  try {
    const prompt = buildPrompt(req.body);
    const message = await callClaude(prompt);
    const text = extractOutputText(message);
    const result = parseModelJson(text);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "생성 중 오류가 발생했습니다.";
    return res.status(500).json({ error: message });
  }
});

app.post("/generate-titles", async (req, res) => {
  const errorMessage = validatePayload(req.body);
  if (errorMessage) {
    return res.status(400).json({ error: errorMessage });
  }

  try {
    const prompt = buildTitleOnlyPrompt(req.body);
    const message = await callClaude(prompt);
    const text = extractOutputText(message);
    const result = parseTitlesOnlyJson(text);
    return res.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "제목 생성 중 오류가 발생했습니다.";
    return res.status(500).json({ error: message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
