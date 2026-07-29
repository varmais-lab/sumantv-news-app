import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "index.html",
  "editor.html",
  "assets/app.css",
  "assets/app.js",
  "assets/editor.css",
  "assets/editor.js",
  "assets/favicon.svg",
  "api/story.js",
  "api/sitemap.js",
  "vercel.json",
  "robots.txt",
  "scripts/test-phase2-apis.mjs",
  "supabase/migrations/20260728000000_phase_1_shorts_foundation.sql",
  "supabase/migrations/20260729052113_phase_2_editorial_workflow.sql",
];

const failures = [];

for (const file of requiredFiles) {
  try {
    const details = await stat(resolve(root, file));
    if (!details.isFile() || details.size === 0) failures.push(`${file} is empty`);
  } catch {
    failures.push(`${file} is missing`);
  }
}

const [
  html,
  editorHtml,
  app,
  editorApp,
  vercelText,
  phase1Migration,
  phase2Migration,
  storyApi,
  sitemapApi,
  robots,
] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "editor.html"), "utf8"),
  readFile(resolve(root, "assets/app.js"), "utf8"),
  readFile(resolve(root, "assets/editor.js"), "utf8"),
  readFile(resolve(root, "vercel.json"), "utf8"),
  readFile(
    resolve(root, "supabase/migrations/20260728000000_phase_1_shorts_foundation.sql"),
    "utf8",
  ),
  readFile(
    resolve(root, "supabase/migrations/20260729052113_phase_2_editorial_workflow.sql"),
    "utf8",
  ),
  readFile(resolve(root, "api/story.js"), "utf8"),
  readFile(resolve(root, "api/sitemap.js"), "utf8"),
  readFile(resolve(root, "robots.txt"), "utf8"),
]);

const vercel = JSON.parse(vercelText);
const structuredData = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
const structuredDataHash = structuredData
  ? createHash("sha256").update(structuredData).digest("base64")
  : "";

const assertions = [
  [html.includes('<html lang="te">'), "index.html must declare Telugu"],
  [html.includes('rel="canonical"'), "index.html must include a canonical URL"],
  [!html.includes("user-scalable=no"), "browser zoom must not be disabled"],
  [!html.includes("onclick="), "inline event handlers are not allowed"],
  [!app.includes("innerHTML"), "dynamic rendering must not use innerHTML"],
  [!app.includes("service_role"), "browser JavaScript must not mention a service-role key"],
  [!app.includes("YOUR_GOOGLE_FORM"), "placeholder lead forms must not ship"],
  [!app.includes("docs.google.com/spreadsheets"), "the public feed must not use Google Sheets"],
  [app.includes("/stories/${encodeURIComponent(story.slug)}"), "sharing must use clean story URLs"],
  [editorHtml.includes("noindex,nofollow,noarchive"), "the editorial desk must be noindex"],
  [!editorHtml.includes("onclick="), "editor inline event handlers are not allowed"],
  [!editorApp.includes("innerHTML"), "editor rendering must not use innerHTML"],
  [!editorApp.includes("service_role"), "editor JavaScript must not mention a service-role key"],
  [editorApp.includes("sessionStorage"), "editor sessions must be scoped to the browser tab"],
  [
    editorApp.includes("app_metadata?.shorts_role"),
    "editor authorization must read the trusted app_metadata role",
  ],
  [Array.isArray(vercel.headers) && vercel.headers.length > 0, "security headers are required"],
  [vercelText.includes("Content-Security-Policy"), "a Content Security Policy is required"],
  [vercelText.includes('"/stories/:slug"'), "clean story routes must be rewritten"],
  [vercelText.includes('"/api/sitemap"'), "the dynamic sitemap rewrite is required"],
  [robots.includes("Disallow: /editor"), "robots.txt must exclude the editorial desk"],
  [
    vercelText.includes(`'sha256-${structuredDataHash}'`),
    "the Content Security Policy must allow only the exact JSON-LD hash",
  ],
  [
    (phase1Migration.match(/enable row level security/g) || []).length === 6,
    "all six public shorts tables must enable RLS",
  ],
  [
    phase1Migration.includes("No anon or authenticated Data API grants in Phase 1"),
    "lead PII protection must be documented in the migration",
  ],
  [
    phase1Migration.includes("'shorts-news-images'"),
    "the namespaced image bucket must be configured",
  ],
  [phase2Migration.includes("shorts_private.is_admin"), "Phase 2 must define the admin role"],
  [
    phase2Migration.includes("shorts stories editorial update"),
    "Phase 2 must enforce the story workflow through RLS",
  ],
  [
    phase2Migration.includes("shorts stories admin delete"),
    "story deletion must remain admin-only",
  ],
  [
    phase2Migration.includes("shorts news images admin delete"),
    "image deletion must remain admin-only",
  ],
  [storyApi.includes("escapeHtml"), "story HTML must escape database content"],
  [storyApi.includes("SLUG_PATTERN"), "story routes must validate slugs"],
  [storyApi.includes("status\", \"eq.published"), "story API must request published rows only"],
  [!storyApi.includes("service_role"), "story API must not use a service-role key"],
  [sitemapApi.includes("status\", \"eq.published"), "sitemap must request published rows only"],
];

for (const id of editorApp.matchAll(/document\.querySelector\("#([^"]+)"\)/g)) {
  assertions.push([
    editorHtml.includes(`id="${id[1]}"`),
    `editor.html must include the #${id[1]} element used by editor.js`,
  ]);
}

for (const [condition, message] of assertions) {
  if (!condition) failures.push(message);
}

if (failures.length) {
  console.error("Phase 2 validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Phase 2 validation passed (${requiredFiles.length} required files).`);
}
