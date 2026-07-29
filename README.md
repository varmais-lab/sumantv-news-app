# SumanTV Shorts

SumanTV Shorts is a mobile-first Telugu short-news feed backed by the existing
`suman-tv-production` Supabase project and deployed through Vercel.

## Current scope

- `/` is the canonical public feed; `/sumanshortnews.html` redirects to it.
- `/stories/:slug` serves a shareable, server-rendered story page with story-specific
  canonical, Open Graph, and Twitter metadata.
- `/sitemap.xml` is generated from currently published stories.
- `/editor` is a secure, unlisted editorial desk for authenticated Supabase users.
- Editors can create drafts, upload licensed images, and submit stories for review.
- Admins can publish, schedule, revise, archive, and delete editorial content.
- Supabase Row Level Security enforces workflow roles independently of the browser UI.
- Lead collection remains disabled until a rate-limited server-side endpoint is available.
- Like and save choices remain local to the current browser.
- Existing non-shorts files and existing Supabase tables are not changed.

## Structure

```text
index.html                Semantic app shell and metadata
assets/app.css            Responsive, accessible presentation
assets/app.js             Supabase feed, rendering, sharing, local preferences
editor.html               Authenticated editorial workspace
assets/editor.css         Responsive editorial presentation
assets/editor.js          Auth, story workflow, and image uploads
api/story.js              Escaped server-rendered story pages
api/sitemap.js            Dynamic published-story sitemap
supabase/migrations/      Additive shorts_* schema, RLS, indexes, and image bucket
vercel.json               Redirects, rewrites, cache rules, and security headers
scripts/validate.mjs      Dependency-free repository checks
```

## Local check

```bash
node scripts/validate.mjs
node scripts/test-phase2-apis.mjs
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.

The plain static server checks the browser assets. Story and sitemap functions run on a
Vercel preview or deployment.

## First editorial administrator

No administrator credentials or privileged keys are committed to this repository.

1. In Supabase Authentication, create or identify the intended staff user with email/password.
2. Set the user's trusted `app_metadata` to:

   ```json
   { "shorts_role": "admin" }
   ```

3. Sign out and sign back in so the refreshed JWT contains the role.
4. Open `/editor` and publish only after verifying the story source and image rights.

Use `{"shorts_role":"editor"}` for staff who should create drafts and submit reviews but
must not publish or archive. Assign this in `app_metadata`, never `user_metadata`; users
can change their own user metadata.

## Publishing workflow

1. An editor creates a `draft`, enters a verifiable HTTPS source, and uploads or links a
   rights-cleared image.
2. The editor moves the story to `review`.
3. An admin verifies the content, publishes immediately, or chooses a future publish time.
4. Published stories become readable through the public RLS policy and appear in the feed
   and sitemap. Future-scheduled stories remain private until their publish time.

Do not put a Supabase service-role key in this repository or in browser code. The included
`sb_publishable_...` key is intentionally public and is constrained by grants and RLS.
