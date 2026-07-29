# SumanTV Shorts

SumanTV Shorts is a mobile-first Telugu short-news feed. Phase 1 replaces the legacy Google
Sheet page with a static, root-first frontend backed by the existing
`suman-tv-production` Supabase project.

## Phase 1 boundaries

- `/` is the canonical app route; `/sumanshortnews.html` redirects to it.
- The public frontend reads only `published` rows allowed by Supabase Row Level Security.
- Stale demo election stories and unconfigured demo deals are not rendered.
- Lead collection stays disabled until a rate-limited server-side endpoint is available.
- Like and save choices are clearly local to the current browser in Phase 1.
- Existing non-shorts files and existing Supabase tables are not changed.

## Structure

```text
index.html                Semantic app shell and metadata
assets/app.css            Responsive, accessible presentation
assets/app.js             Supabase feed, rendering, sharing, local preferences
supabase/migrations/      Additive shorts_* schema, RLS, indexes, and image bucket
vercel.json               Redirects and security headers
scripts/validate.mjs      Dependency-free repository checks
```

## Local check

```bash
node scripts/validate.mjs
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.

## Publishing a story

An authenticated Supabase user needs `app_metadata.shorts_role` set to `editor` or `admin`.
Create the story as `draft` or `review`, verify its source and image rights, then set
`status = 'published'` and provide `published_at`. Anonymous visitors can never create,
change, or archive stories.

Do not put a Supabase service-role key in this repository or in browser code. The included
`sb_publishable_...` key is intentionally public and is constrained by grants and RLS.
