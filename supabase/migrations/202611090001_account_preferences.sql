-- Optional future preference storage. The current desktop profile uses Auth metadata.
-- Review and deploy deliberately; the desktop never executes migrations.
create table if not exists public.account_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint bounded_preferences check (octet_length(preferences::text) <= 8192)
);
alter table public.account_preferences enable row level security;
alter table public.account_preferences force row level security;
revoke all on public.account_preferences from anon;
grant select, insert, update, delete on public.account_preferences to authenticated;
create policy "read own preferences" on public.account_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own preferences" on public.account_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own preferences" on public.account_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own preferences" on public.account_preferences for delete to authenticated using ((select auth.uid()) = user_id);
-- Plan entitlements and administrator privileges never come from this table or user_metadata.
