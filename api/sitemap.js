"use strict";

const SUPABASE_URL = "https://njxwfgcayotvjmozhlab.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Qo_hvPXG8qJfMgUZ12ILDQ_FlaZypMm";
const SITE_URL = "https://sumantv-shorts.vercel.app";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function fetchPublishedStories() {
  const url = new URL("/rest/v1/shorts_stories", SUPABASE_URL);
  url.searchParams.set("select", "slug,updated_at");
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("order", "published_at.desc,id.desc");
  url.searchParams.set("limit", "5000");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) throw new Error(`Sitemap request failed with HTTP ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function renderSitemap(rows) {
  const storyEntries = rows
    .filter((row) => typeof row?.slug === "string" && SLUG_PATTERN.test(row.slug))
    .map((row) => {
      const canonical = `${SITE_URL}/stories/${encodeURIComponent(row.slug)}`;
      const updatedAt = Date.parse(row.updated_at);
      const lastModified = Number.isFinite(updatedAt)
        ? `\n    <lastmod>${xmlEscape(new Date(updatedAt).toISOString())}</lastmod>`
        : "";
      return `  <url>
    <loc>${xmlEscape(canonical)}</loc>${lastModified}
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${xmlEscape(`${SITE_URL}/`)}</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>${storyEntries ? `\n${storyEntries}` : ""}
</urlset>`;
}

async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.end();
    return;
  }

  try {
    const rows = await fetchPublishedStories();
    const body = request.method === "HEAD" ? "" : renderSitemap(rows);
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/xml; charset=utf-8");
    response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(body);
  } catch (error) {
    console.error("Unable to build the sitemap", error);
    response.statusCode = 503;
    response.setHeader("Cache-Control", "private, no-store");
    response.end();
  }
}

module.exports = handler;
module.exports.renderSitemap = renderSitemap;
module.exports.xmlEscape = xmlEscape;
