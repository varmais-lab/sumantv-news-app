import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const storyHandler = require("../api/story.js");
const sitemapHandler = require("../api/sitemap.js");

function mockResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: "",
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
    },
    end(body = "") {
      this.body = body;
    },
  };
}

const originalFetch = global.fetch;

try {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return [
        {
          id: 7,
          slug: "verified-story",
          title_te: 'ధృవీకరణ <img src=x onerror="alert(1)">',
          summary_te: "సురక్షితమైన & సంక్షిప్త సమాచారం.",
          source_name: "SumanTV",
          source_url: "https://example.com/source",
          image_url: "javascript:alert(1)",
          image_alt_te: "కథనం",
          is_breaking: true,
          is_live: false,
          published_at: "2026-07-29T05:00:00.000Z",
          category: { name_te: "తాజా" },
        },
      ];
    },
  });

  const storyResponse = mockResponse();
  await storyHandler({ method: "GET", query: { slug: "verified-story" } }, storyResponse);
  assert.equal(storyResponse.statusCode, 200);
  assert.match(storyResponse.headers.get("content-type"), /^text\/html/);
  assert.match(storyResponse.body, /\/stories\/verified-story/);
  assert.match(storyResponse.body, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(storyResponse.body, /<img src=x onerror=/);
  assert.doesNotMatch(storyResponse.body, /javascript:alert/);
  assert.match(storyResponse.body, /<h1 class="story-title"/);
  [
    "activeCategory",
    "refreshButton",
    "feed",
    "loadingPanel",
    "emptyPanel",
    "emptyRefreshButton",
    "errorPanel",
    "errorRetryButton",
    "storyList",
    "loadSentinel",
    "storyCounter",
    "feedTimestamp",
    "toast",
  ].forEach((id) => {
    assert.match(storyResponse.body, new RegExp(`id="${id}"`));
  });

  const invalidResponse = mockResponse();
  await storyHandler({ method: "GET", query: { slug: "../draft" } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 404);

  const sitemap = sitemapHandler.renderSitemap([
    { slug: "verified-story", updated_at: "2026-07-29T05:00:00.000Z" },
    { slug: "unsafe&story", updated_at: "not-a-date" },
  ]);
  assert.match(sitemap, /https:\/\/sumantv-shorts\.vercel\.app\/stories\/verified-story/);
  assert.match(sitemap, /2026-07-29T05:00:00\.000Z/);
  assert.doesNotMatch(sitemap, /unsafe&amp;story/);

  console.log("Phase 2 API tests passed.");
} finally {
  global.fetch = originalFetch;
}
