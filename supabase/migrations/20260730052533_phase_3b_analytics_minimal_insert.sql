-- The browser uses INSERT with return=minimal. Anonymous SELECT is not needed.

revoke select on table public.shorts_story_events from anon;
