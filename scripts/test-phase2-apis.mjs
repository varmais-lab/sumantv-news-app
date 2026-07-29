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

  const videoPage = storyHandler.renderStoryPage({
    id: 8,
    slug: "youtube-short",
    title: "YouTube Short",
    summary: "A verified short video.",
    sourceName: "SumanTV",
    sourceUrl: "https://youtube.com/shorts/dQw4w9WgXcQ",
    imageUrl: "",
    imageAlt: "YouTube Short",
    contentType: "youtube_short",
    youtubeVideoId: "dQw4w9WgXcQ",
    media: [],
    publishedAt: "2026-07-29T05:00:00.000Z",
    isBreaking: false,
    isLive: false,
    category: "వినోదం",
  });
  assert.match(videoPage, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(videoPage, /youtube-media is-short/);

  const galleryPage = storyHandler.renderStoryPage({
    id: 9,
    slug: "movie-gallery",
    title: "Movie Gallery",
    summary: "A verified image gallery.",
    sourceName: "SumanTV",
    sourceUrl: "",
    imageUrl: "",
    imageAlt: "Movie Gallery",
    contentType: "gallery",
    youtubeVideoId: "",
    media: [
      {
        position: 1,
        imageUrl: "https://example.com/one.jpg",
        imageAlt: "చిత్రం ఒకటి",
        caption: 'Caption <script>alert("x")</script>',
      },
      {
        position: 2,
        imageUrl: "https://example.com/two.jpg",
        imageAlt: "చిత్రం రెండు",
        caption: "",
      },
    ],
    publishedAt: "2026-07-29T05:00:00.000Z",
    isBreaking: false,
    isLive: false,
    category: "సినిమాలు",
  });
  assert.match(galleryPage, /1 \/ 2/);
  assert.match(galleryPage, /Caption &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(galleryPage, /<script>alert/);

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

  console.log("Phase 3 API tests passed.");
} finally {
  global.fetch = originalFetch;
}
