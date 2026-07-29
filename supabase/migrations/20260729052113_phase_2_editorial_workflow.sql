-- SumanTV Shorts — Phase 2 editorial workflow
-- Additive hardening for authenticated editors and admin-only publication.

begin;

create or replace function shorts_private.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt()) -> 'app_metadata' ->> 'shorts_role',
    ''
  ) = 'admin';
$$;

revoke all on function shorts_private.is_admin() from public, anon;
grant execute on function shorts_private.is_admin() to authenticated, service_role;

alter table public.shorts_stories
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists version integer not null default 1;

alter table public.shorts_deals
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists version integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shorts_stories_version_positive'
      and conrelid = 'public.shorts_stories'::regclass
  ) then
    alter table public.shorts_stories
      add constraint shorts_stories_version_positive check (version > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shorts_deals_version_positive'
      and conrelid = 'public.shorts_deals'::regclass
  ) then
    alter table public.shorts_deals
      add constraint shorts_deals_version_positive check (version > 0);
  end if;
end;
$$;

create index if not exists shorts_stories_reviewed_by_idx
  on public.shorts_stories (reviewed_by)
  where reviewed_by is not null;

create index if not exists shorts_deals_updated_by_idx
  on public.shorts_deals (updated_by)
  where updated_by is not null;

create or replace function shorts_private.manage_story_workflow()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    new.created_by := actor_id;
    new.updated_by := actor_id;
    new.version := 1;

    if new.status = 'published' then
      new.published_at := coalesce(new.published_at, pg_catalog.now());
      new.reviewed_by := actor_id;
      new.reviewed_at := pg_catalog.now();
    else
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;

    return new;
  end if;

  new.created_by := old.created_by;
  new.updated_by := actor_id;
  new.version := old.version + 1;

  if new.status = 'published' and old.status is distinct from 'published' then
    new.published_at := coalesce(new.published_at, pg_catalog.now());
    new.reviewed_by := actor_id;
    new.reviewed_at := pg_catalog.now();
  elsif new.status in ('draft', 'review') and old.status is distinct from new.status then
    new.published_at := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.is_live := false;
  end if;

  return new;
end;
$$;

revoke all on function shorts_private.manage_story_workflow()
  from public, anon, authenticated;

drop trigger if exists shorts_stories_manage_workflow on public.shorts_stories;
create trigger shorts_stories_manage_workflow
before insert or update on public.shorts_stories
for each row execute function shorts_private.manage_story_workflow();

create or replace function shorts_private.manage_deal_workflow()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    new.created_by := actor_id;
    new.updated_by := actor_id;
    new.version := 1;
    return new;
  end if;

  new.created_by := old.created_by;
  new.updated_by := actor_id;
  new.version := old.version + 1;
  return new;
end;
$$;

revoke all on function shorts_private.manage_deal_workflow()
  from public, anon, authenticated;

drop trigger if exists shorts_deals_manage_workflow on public.shorts_deals;
create trigger shorts_deals_manage_workflow
before insert or update on public.shorts_deals
for each row execute function shorts_private.manage_deal_workflow();

drop policy if exists "shorts categories editor insert" on public.shorts_categories;
drop policy if exists "shorts categories editor update" on public.shorts_categories;
drop policy if exists "shorts categories editor delete" on public.shorts_categories;

create policy "shorts categories editor insert"
on public.shorts_categories
for insert
to authenticated
with check ((select shorts_private.is_editor()));

create policy "shorts categories editor update"
on public.shorts_categories
for update
to authenticated
using ((select shorts_private.is_editor()))
with check ((select shorts_private.is_editor()));

create policy "shorts categories admin delete"
on public.shorts_categories
for delete
to authenticated
using ((select shorts_private.is_admin()));

drop policy if exists "shorts stories editor insert" on public.shorts_stories;
drop policy if exists "shorts stories editor update" on public.shorts_stories;
drop policy if exists "shorts stories editor delete" on public.shorts_stories;

create policy "shorts stories editorial insert"
on public.shorts_stories
for insert
to authenticated
with check (
  (select shorts_private.is_editor())
  and (
    (select shorts_private.is_admin())
    or (
      status in ('draft', 'review')
      and published_at is null
      and not is_live
    )
  )
);

create policy "shorts stories editorial update"
on public.shorts_stories
for update
to authenticated
using (
  (select shorts_private.is_admin())
  or (
    (select shorts_private.is_editor())
    and status in ('draft', 'review')
  )
)
with check (
  (select shorts_private.is_admin())
  or (
    (select shorts_private.is_editor())
    and status in ('draft', 'review')
    and published_at is null
    and not is_live
  )
);

create policy "shorts stories admin delete"
on public.shorts_stories
for delete
to authenticated
using ((select shorts_private.is_admin()));

drop policy if exists "shorts deals editor insert" on public.shorts_deals;
drop policy if exists "shorts deals editor update" on public.shorts_deals;
drop policy if exists "shorts deals editor delete" on public.shorts_deals;

create policy "shorts deals editorial insert"
on public.shorts_deals
for insert
to authenticated
with check (
  (select shorts_private.is_editor())
  and (
    (select shorts_private.is_admin())
    or status in ('draft', 'review')
  )
);

create policy "shorts deals editorial update"
on public.shorts_deals
for update
to authenticated
using (
  (select shorts_private.is_admin())
  or (
    (select shorts_private.is_editor())
    and status in ('draft', 'review')
  )
)
with check (
  (select shorts_private.is_admin())
  or (
    (select shorts_private.is_editor())
    and status in ('draft', 'review')
  )
);

create policy "shorts deals admin delete"
on public.shorts_deals
for delete
to authenticated
using ((select shorts_private.is_admin()));

drop policy if exists "shorts news images editor update" on storage.objects;
drop policy if exists "shorts news images editor delete" on storage.objects;

create policy "shorts news images admin update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'shorts-news-images'
  and (select shorts_private.is_admin())
)
with check (
  bucket_id = 'shorts-news-images'
  and (select shorts_private.is_admin())
);

create policy "shorts news images admin delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'shorts-news-images'
  and (select shorts_private.is_admin())
);

comment on function shorts_private.is_admin() is
  'Returns true only for a signed-in user whose trusted app_metadata shorts_role is admin.';

comment on column public.shorts_stories.version is
  'Monotonic editorial version incremented by the workflow trigger.';

comment on column public.shorts_stories.reviewed_by is
  'Admin who most recently moved the story into published status.';

commit;
