import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "index.html",
  "assets/app.css",
  "assets/app.js",
  "assets/favicon.svg",
  "vercel.json",
  "robots.txt",
  "sitemap.xml",
  "supabase/migrations/20260728000000_phase_1_shorts_foundation.sql",
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

const [html, app, vercelText, migration] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "assets/app.js"), "utf8"),
  readFile(resolve(root, "vercel.json"), "utf8"),
  readFile(
    resolve(root, "supabase/migrations/20260728000000_phase_1_shorts_foundation.sql"),
    "utf8",
  ),
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
  [Array.isArray(vercel.headers) && vercel.headers.length > 0, "security headers are required"],
  [vercelText.includes("Content-Security-Policy"), "a Content Security Policy is required"],
  [
    vercelText.includes(`'sha256-${structuredDataHash}'`),
    "the Content Security Policy must allow only the exact JSON-LD hash",
  ],
  [
    (migration.match(/enable row level security/g) || []).length === 6,
    "all six public shorts tables must enable RLS",
  ],
  [
    migration.includes("No anon or authenticated Data API grants in Phase 1"),
    "lead PII protection must be documented in the migration",
  ],
  [
    migration.includes("'shorts-news-images'"),
    "the namespaced image bucket must be configured",
  ],
];

for (const [condition, message] of assertions) {
  if (!condition) failures.push(message);
}

if (failures.length) {
  console.error("Phase 1 validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Phase 1 validation passed (${requiredFiles.length} required files).`);
}
