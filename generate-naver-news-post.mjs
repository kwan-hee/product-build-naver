#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_LIMIT = 5;
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const DEFAULT_OUTPUT_DIR = process.env.OUTPUT_DIR || "output";

async function loadEnvFile(envPath = ".env") {
  try {
    const content = await fs.readFile(envPath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function xmlDecode(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripHtml(value = "") {
  return xmlDecode(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? xmlDecode(match[1]) : "";
}

function parseRssItems(xml) {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  return itemBlocks.map((block) => {
    const rawTitle = extractTag(block, "title");
    const title = rawTitle.replace(/\s*-\s*Google 뉴스$/i, "").trim();

    return {
      title,
      link: extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
      source: extractTag(block, "source") || "미상",
      description: stripHtml(extractTag(block, "description")),
    };
  }).filter((item) => item.title && item.link);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "naver-news-post";
}

function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    if (line.startsWith("### ")) {
      closeList();
      html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }

    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }

    if (line.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${escapeHtml(line)}</p>`);
  }

  closeList();
  return html.join("\n");
}

function buildGoogleNewsRssUrl(keyword) {
  const query = encodeURIComponent(keyword || process.env.NEWS_KEYWORD || "AI");
  return `https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`;
}

async function fetchNews({ keyword, rssUrl, limit }) {
  const targetUrl = rssUrl || process.env.NEWS_RSS_URL || buildGoogleNewsRssUrl(keyword);
  const response = await fetch(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 Codex Naver Blog Generator",
      "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`RSS 요청 실패: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const items = parseRssItems(xml).slice(0, limit);

  if (items.length === 0) {
    throw new Error("RSS에서 기사 항목을 찾지 못했습니다.");
  }

  return { targetUrl, items };
}

function buildPrompt({ keyword, items, generatedAt }) {
  const sourceDigest = items.map((item, index) => {
    return [
      `${index + 1}. 제목: ${item.title}`,
      `출처: ${item.source}`,
      `발행일: ${item.pubDate || "미상"}`,
      `설명: ${item.description || "설명 없음"}`,
      `링크: ${item.link}`,
    ].join("\n");
  }).join("\n\n");

  return `당신은 한국어 네이버 블로그 전문 에디터다.
아래 뉴스 소스를 바탕으로 네이버 블로그에 바로 붙여넣을 수 있는 뉴스 브리핑 초안을 작성해라.
과장 없이 정보성 문체를 유지하고, 클릭 유도 문구는 절제해라.
출력은 반드시 JSON 하나만 반환해라.

JSON 스키마:
{
  "title": "포스팅 제목",
  "excerpt": "120자 이내 요약",
  "tags": ["태그1", "태그2", "태그3"],
  "content_markdown": "마크다운 본문"
}

본문 요구사항:
- 한국어로 작성
- 제목 바로 아래에 한 문단 요약
- 섹션은 최소 4개
- 각 섹션은 독자가 빠르게 이해할 수 있게 짧은 문단과 불릿을 혼합
- 마지막에는 '오늘의 체크포인트' 섹션 추가
- 마지막에는 '출처' 섹션을 만들고 기사 제목과 링크를 bullet로 정리
- 검증되지 않은 추정은 쓰지 말 것
- 날짜 기준은 ${generatedAt}
- 주제 키워드: ${keyword}

뉴스 소스:
${sourceDigest}`;
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (Array.isArray(payload.output)) {
    const texts = [];

    for (const outputItem of payload.output) {
      if (!Array.isArray(outputItem.content)) {
        continue;
      }

      for (const contentItem of outputItem.content) {
        if (contentItem.type === "output_text" && contentItem.text) {
          texts.push(contentItem.text);
        }
      }
    }

    if (texts.length > 0) {
      return texts.join("\n").trim();
    }
  }

  throw new Error("AI 응답에서 텍스트를 추출하지 못했습니다.");
}

function parseJsonResponse(text) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

async function requestAiDraft({ keyword, items, model }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const prompt = buildPrompt({
    keyword,
    items,
    generatedAt: new Date().toISOString(),
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI 요청 실패: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const responseText = extractResponseText(payload);
  return parseJsonResponse(responseText);
}

function buildFallbackDraft({ keyword, items }) {
  const lead = items[0];
  const lines = [
    `# ${keyword} 뉴스 브리핑: ${lead.title}`,
    `${keyword} 관련 최신 뉴스를 빠르게 훑어볼 수 있도록 핵심만 정리했습니다. 오늘은 ${items.length}건의 기사를 기준으로 흐름을 묶었습니다.`,
    "## 오늘 뉴스 한눈에 보기",
    ...items.map((item) => `- ${item.title} (${item.source})`),
    "## 흐름 정리",
    "최근 보도는 기술 출시, 산업 제휴, 정책 변화, 시장 반응이라는 네 축으로 읽는 것이 가장 효율적입니다.",
    "- 어떤 기업이나 서비스가 먼저 움직였는지",
    "- 시장이 그 움직임을 어떻게 해석하는지",
    "- 실제 사용자나 업계에 미칠 영향이 무엇인지",
    "## 실무 관점에서 볼 포인트",
    "- 발표 자체보다 실행 시점과 적용 범위를 같이 봐야 합니다.",
    "- 한 기사만 보면 과대평가하기 쉬우므로 여러 출처를 함께 확인하는 편이 안전합니다.",
    "- 서비스 운영자나 마케터라면 바로 적용 가능한 활용 시나리오를 따로 체크해두는 것이 좋습니다.",
    "## 오늘의 체크포인트",
    "- 새롭게 등장한 기능이나 정책이 실제 사용 환경에 언제 반영되는지 확인",
    "- 경쟁 서비스와 비교했을 때 차별점이 유지되는지 검토",
    "- 후속 발표나 추가 기사에서 정정 또는 보완 내용이 나오는지 추적",
    "## 출처",
    ...items.map((item) => `- ${item.title} - ${item.link}`),
  ];

  return {
    title: `${keyword} 뉴스 브리핑: ${lead.title}`,
    excerpt: `${keyword} 관련 최신 뉴스를 네이버 블로그용으로 정리한 초안입니다. 핵심 흐름과 체크포인트를 빠르게 확인할 수 있습니다.`,
    tags: [keyword, "AI뉴스", "네이버블로그", "뉴스정리"],
    content_markdown: lines.join("\n\n"),
  };
}

async function saveDraft({ draft, items, outputDir }) {
  await fs.mkdir(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = slugify(draft.title);
  const markdownPath = path.join(outputDir, `${timestamp}-${slug}.md`);
  const htmlPath = path.join(outputDir, `${timestamp}-${slug}.html`);

  const frontMatter = [
    `title: ${draft.title}`,
    `excerpt: ${draft.excerpt}`,
    `tags: ${draft.tags.join(", ")}`,
    `generated_at: ${new Date().toISOString()}`,
    `source_count: ${items.length}`,
    "",
  ].join("\n");

  const markdownOutput = `${frontMatter}${draft.content_markdown}\n`;
  const htmlOutput = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(draft.title)}</title>
</head>
<body>
  <article>
    ${markdownToHtml(draft.content_markdown)}
  </article>
</body>
</html>\n`;

  await fs.writeFile(markdownPath, markdownOutput, "utf8");
  await fs.writeFile(htmlPath, htmlOutput, "utf8");

  return { markdownPath, htmlPath };
}

async function main() {
  await loadEnvFile();

  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`사용법:
  node generate-naver-news-post.mjs --keyword "AI" --limit 5

옵션:
  --keyword     뉴스 검색 키워드
  --rss-url     직접 사용할 RSS 주소
  --limit       가져올 기사 수 (기본값 5)
  --output-dir  결과 저장 디렉터리 (기본값 output)`);
    return;
  }

  const keyword = args.keyword || process.env.NEWS_KEYWORD || "AI";
  const limit = Number.parseInt(args.limit || process.env.NEWS_LIMIT || DEFAULT_LIMIT, 10);
  const outputDir = args["output-dir"] || process.env.OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const { targetUrl, items } = await fetchNews({
    keyword,
    rssUrl: args["rss-url"],
    limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
  });

  let draft;
  let mode = "fallback";

  try {
    draft = await requestAiDraft({ keyword, items, model });
    if (draft) {
      mode = "ai";
    }
  } catch (error) {
    console.warn(`[warn] AI 초안 생성 실패. fallback으로 전환합니다: ${error.message}`);
  }

  if (!draft) {
    draft = buildFallbackDraft({ keyword, items });
  }

  const { markdownPath, htmlPath } = await saveDraft({ draft, items, outputDir });

  console.log(JSON.stringify({
    keyword,
    mode,
    rss_url: targetUrl,
    article_count: items.length,
    markdown_path: markdownPath,
    html_path: htmlPath,
    title: draft.title,
    tags: draft.tags,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[error] ${error.message}`);
  process.exitCode = 1;
});
