-- PostgREST needs SELECT privilege to resolve the event uniqueness constraint
-- used by ON CONFLICT. RLS still exposes no rows to anon because the only
-- SELECT policy is explicitly scoped to authenticated admins.

grant select on table public.shorts_story_events to anon;
