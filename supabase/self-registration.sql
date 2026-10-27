-- Self-registration requests for PROPERTY FIND CRM
create table if not exists public.team_join_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text not null,
  designation text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
alter table public.team_join_requests enable row level security;
drop policy if exists "join_requests_insert_self" on public.team_join_requests;
create policy "join_requests_insert_self" on public.team_join_requests
 for insert to authenticated
 with check (auth.uid() = user_id and status = 'pending');
drop policy if exists "join_requests_read_self_or_admin" on public.team_join_requests;
create policy "join_requests_read_self_or_admin" on public.team_join_requests
 for select to authenticated
 using (auth.uid() = user_id or auth.uid() = workspace_owner_id);
drop policy if exists "join_requests_admin_update" on public.team_join_requests;
create policy "join_requests_admin_update" on public.team_join_requests
 for update to authenticated
 using (auth.uid() = workspace_owner_id)
 with check (auth.uid() = workspace_owner_id);
drop policy if exists "join_requests_admin_delete" on public.team_join_requests;
create policy "join_requests_admin_delete" on public.team_join_requests
 for delete to authenticated
 using (auth.uid() = workspace_owner_id);

-- Only approved members can be added to workspace_members by the workspace owner.
drop policy if exists "workspace_members_owner_add" on public.workspace_members;
create policy "workspace_members_owner_add" on public.workspace_members for insert to authenticated
with check (
 auth.uid() = workspace_owner_id
 and exists (
  select 1 from public.team_join_requests r
  where r.workspace_owner_id = workspace_members.workspace_owner_id
   and r.user_id = workspace_members.member_user_id
   and r.status = 'approved'
 )
);
