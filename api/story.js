"use strict";

const SUPABASE_URL = "https://njxwfgcayotvjmozhlab.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Qo_hvPXG8qJfMgUZ12ILDQ_FlaZypMm";
const SITE_URL = "https://sumantv-shorts.vercel.app";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHttpsUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeSlug(value) {
  const slug = cleanText(Array.isArray(value) ? value[0] : value);
  return slug.length <= 160 && SLUG_PATTERN.test(slug) ? slug : "";
}

function normalizeStory(row) {
  const title = cleanText(row?.title_te) || cleanText(row?.title_en);
  const summary = cleanText(row?.summary_te) || cleanText(row?.summary_en);
  const category = Array.isArray(row?.category) ? row.category[0] : row?.category;

  if (!row?.id || !row?.slug || !title || !summary) return null;

  return {
    id: row.id,
    slug: cleanText(row.slug),
    title,
    summary,
    sourceName: cleanText(row.source_name, "SumanTV"),
    sourceUrl: safeHttpsUrl(row.source_url),
    imageUrl: safeHttpsUrl(row.image_url),
    imageAlt: cleanText(row.image_alt_te, title),
    contentType: cleanText(row.content_type, "article"),
    youtubeVideoId: /^[A-Za-z0-9_-]{11}$/.test(row.youtube_video_id || "")
      ? row.youtube_video_id
      : "",
    media: Array.isArray(row.media)
      ? row.media
        .map((media) => ({
          position: Number(media.position) || 0,
          imageUrl: safeHttpsUrl(media.image_url),
          imageAlt: cleanText(media.image_alt_te, title),
          caption: cleanText(media.caption_te),
        }))
        .filter((media) => media.imageUrl)
        .sort((a, b) => a.position - b.position)
      : [],
    publishedAt: row.published_at,
    isBreaking: Boolean(row.is_breaking),
    isLive: Boolean(row.is_live),
    category: cleanText(category?.name_te) || cleanText(category?.name_en, "వార్తలు"),
  };
}

async function fetchStory(slug) {
  const url = new URL("/rest/v1/shorts_stories", SUPABASE_URL);
  url.searchParams.set(
    "select",
    [
      "id",
      "slug",
      "title_te",
      "title_en",
      "summary_te",
      "summary_en",
      "source_name",
      "source_url",
      "image_url",
      "image_alt_te",
      "content_type",
      "youtube_video_id",
      "is_breaking",
      "is_live",
      "published_at",
      "media:shorts_story_media(position,image_url,image_alt_te,caption_te)",
      "category:shorts_categories(name_te,name_en)",
    ].join(","),
  );
  url.searchParams.set("slug", `eq.${slug}`);
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) throw new Error(`Story request failed with HTTP ${response.status}`);
  const rows = await response.json();
  return normalizeStory(Array.isArray(rows) ? rows[0] : null);
}

function renderBadges(story) {
  const badges = [`<span class="story-category">${escapeHtml(story.category)}</span>`];
  if (story.isBreaking) badges.push('<span class="breaking-badge">బ్రేకింగ్</span>');
  if (story.isLive) badges.push('<span class="live-badge">లైవ్</span>');
  return badges.join("");
}

function renderSource(story) {
  if (!story.sourceUrl) {
    return `<span class="story-source">${escapeHtml(story.sourceName)}</span>`;
  }
  return `<a class="story-source" href="${escapeHtml(story.sourceUrl)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(story.sourceName)}</a>`;
}

function renderStoryMedia(story) {
  if (story.youtubeVideoId) {
    const shortClass = story.contentType === "youtube_short" ? " is-short" : "";
    return `<div class="youtube-media${shortClass}">
      <iframe
        src="https://www.youtube-nocookie.com/embed/${escapeHtml(story.youtubeVideoId)}"
        title="${escapeHtml(story.title)}"
        loading="eager"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      ></iframe>
    </div>`;
  }

  if (story.contentType === "gallery" && story.media.length) {
    const slides = story.media.map((media, index) => `<figure class="gallery-slide">
      <img src="${escapeHtml(media.imageUrl)}" alt="${escapeHtml(media.imageAlt)}" decoding="async" referrerpolicy="no-referrer">
      <span class="gallery-counter">${index + 1} / ${story.media.length}</span>
      ${media.caption ? `<figcaption>${escapeHtml(media.caption)}</figcaption>` : ""}
    </figure>`).join("");
    return `<div class="story-gallery" aria-label="${escapeHtml(story.title)} gallery">${slides}</div>`;
  }

  return story.imageUrl
    ? `<img class="story-media" src="${escapeHtml(story.imageUrl)}" alt="${escapeHtml(story.imageAlt)}" decoding="async" fetchpriority="high" referrerpolicy="no-referrer">`
    : "";
}

function renderStoryCard(story) {
  const media = renderStoryMedia(story);
  const date = Date.parse(story.publishedAt);
  const time = Number.isFinite(date)
    ? `<time class="story-time" datetime="${escapeHtml(new Date(date).toISOString())}">${escapeHtml(
      new Intl.DateTimeFormat("te-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date),
    )}</time>`
    : "";
  const readMore = story.sourceUrl
    ? `<a class="source-button" href="${escapeHtml(story.sourceUrl)}" target="_blank" rel="noopener noreferrer nofollow">పూర్తి కథనం ↗</a>`
    : "";

  return `<article class="story-card" aria-labelledby="story-title-${escapeHtml(story.id)}">
    ${media}
    <div class="story-content">
      <div class="story-meta">${renderBadges(story)}${renderSource(story)}${time}</div>
      <h1 class="story-title" id="story-title-${escapeHtml(story.id)}">${escapeHtml(story.title)}</h1>
      <p class="story-summary">${escapeHtml(story.summary)}</p>
      <div class="story-actions">${readMore}</div>
    </div>
  </article>`;
}

function renderStoryPage(story) {
  const canonical = `${SITE_URL}/stories/${encodeURIComponent(story.slug)}`;
  const title = `${story.title} — SumanTV Shorts`;
  const description = story.summary.slice(0, 155);
  const imageMeta = story.imageUrl
    ? `<meta property="og:image" content="${escapeHtml(story.imageUrl)}">
    <meta name="twitter:image" content="${escapeHtml(story.imageUrl)}">`
    : "";

  return `<!DOCTYPE html>
<html lang="te">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#080a0f">
    <meta name="color-scheme" content="dark">
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <meta property="og:type" content="article">
    <meta property="og:locale" content="te_IN">
    <meta property="og:site_name" content="SumanTV Shorts">
    <meta property="og:title" content="${escapeHtml(story.title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    ${imageMeta}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(story.title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/assets/app.css">
    <title>${escapeHtml(title)}</title>
    <script src="/assets/app.js" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#feed">వార్తలకు వెళ్లండి</a>
    <header class="topbar" aria-label="ప్రధాన శీర్షిక">
      <a class="brand" href="/" aria-label="SumanTV Shorts హోమ్">
        <span class="brand-mark" aria-hidden="true">S</span>
        <span>SumanTV <strong>Shorts</strong></span>
      </a>
      <div class="topbar-actions">
        <span class="category-pill" id="activeCategory">${escapeHtml(story.category)}</span>
        <button class="icon-button" id="refreshButton" type="button" aria-label="వార్తలను రిఫ్రెష్ చేయండి">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7"/></svg>
        </button>
      </div>
    </header>
    <main id="feed" class="feed" tabindex="-1" aria-busy="false">
      <section class="state-panel loading-panel" id="loadingPanel" aria-live="polite" hidden>
        <div class="loader" aria-hidden="true"></div>
        <p>ధృవీకరించిన వార్తలను లోడ్ చేస్తున్నాం…</p>
      </section>
      <section class="state-panel empty-panel" id="emptyPanel" hidden>
        <h1>ఈ కథనం అందుబాటులో లేదు.</h1>
        <a class="primary-button" href="/">తాజా వార్తలు చూడండి</a>
        <button class="primary-button" id="emptyRefreshButton" type="button">మళ్లీ చూడండి</button>
      </section>
      <section class="state-panel error-panel" id="errorPanel" hidden role="alert">
        <h1>కథనాన్ని ప్రస్తుతం లోడ్ చేయలేకపోయాం.</h1>
        <button class="primary-button" id="errorRetryButton" type="button">మళ్లీ ప్రయత్నించండి</button>
      </section>
      <section class="story-list" id="storyList" aria-label="వార్తల ఫీడ్">${renderStoryCard(story)}</section>
      <div class="load-sentinel" id="loadSentinel" aria-hidden="true"></div>
    </main>
    <aside class="feed-status" aria-label="ఫీడ్ స్థితి">
      <span id="storyCounter">1 / 1</span>
      <span class="status-divider" aria-hidden="true"></span>
      <span id="feedTimestamp">ప్రచురిత కథనం</span>
    </aside>
    <div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
    <noscript><div class="noscript-message">JavaScript లేకుండానే పై కథనాన్ని చదవవచ్చు.</div></noscript>
  </body>
</html>`;
}

function renderNotFound() {
  return `<!DOCTYPE html>
<html lang="te">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,follow">
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/assets/app.css">
    <title>కథనం దొరకలేదు — SumanTV Shorts</title>
  </head>
  <body>
    <main class="feed">
      <section class="state-panel error-panel">
        <span class="state-icon error-icon" aria-hidden="true">!</span>
        <p class="eyebrow">404</p>
        <h1>ఈ కథనం దొరకలేదు.</h1>
        <p>ఇది తొలగించబడి ఉండవచ్చు లేదా ఇంకా ప్రచురించబడకపోవచ్చు.</p>
        <a class="primary-button" href="/">తాజా వార్తలు చూడండి</a>
      </section>
    </main>
  </body>
</html>`;
}

function sendHtml(response, status, body, cacheControl) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", cacheControl);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(body);
}

async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return sendHtml(response, 405, renderNotFound(), "private, no-store");
  }

  const slug = normalizeSlug(request.query?.slug);
  if (!slug) return sendHtml(response, 404, renderNotFound(), "public, max-age=60");

  try {
    const story = await fetchStory(slug);
    if (!story) return sendHtml(response, 404, renderNotFound(), "public, max-age=60");

    const body = request.method === "HEAD" ? "" : renderStoryPage(story);
    return sendHtml(response, 200, body, "public, s-maxage=60, stale-while-revalidate=300");
  } catch (error) {
    console.error("Unable to render the requested story", error);
    return sendHtml(response, 503, renderNotFound(), "private, no-store");
  }
}

module.exports = handler;
module.exports.escapeHtml = escapeHtml;
module.exports.normalizeSlug = normalizeSlug;
module.exports.renderStoryPage = renderStoryPage;
