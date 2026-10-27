-- Run in Supabase > SQL Editor.
create table if not exists public.workspace_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.workspace_state enable row level security;
drop policy if exists "Users can read own workspace" on public.workspace_state;
create policy "Users can read own workspace" on public.workspace_state for select to authenticated using (auth.uid() = owner_id);
drop policy if exists "Users can insert own workspace" on public.workspace_state;
create policy "Users can insert own workspace" on public.workspace_state for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists "Users can update own workspace" on public.workspace_state;
create policy "Users can update own workspace" on public.workspace_state for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
