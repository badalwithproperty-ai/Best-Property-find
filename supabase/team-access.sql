-- PROPERTY FIND CRM: secure shared workspace membership
-- Run this in Supabase SQL Editor for project gevdyoshdxquxxavchyb.
-- Existing records remain in workspace_state; this migration does not delete data.

create table if not exists public.workspace_members (
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'associate' check (role in ('admin','associate')),
  created_at timestamptz not null default now(),
  primary key (workspace_owner_id, member_user_id),
  check (workspace_owner_id <> member_user_id)
);

alter table public.workspace_members enable row level security;

drop policy if exists "workspace_members_read_related" on public.workspace_members;
create policy "workspace_members_read_related"
on public.workspace_members for select to authenticated
using (auth.uid() = workspace_owner_id or auth.uid() = member_user_id);

drop policy if exists "workspace_members_owner_add" on public.workspace_members;
create policy "workspace_members_owner_add"
on public.workspace_members for insert to authenticated
with check (auth.uid() = workspace_owner_id);

drop policy if exists "workspace_members_owner_remove" on public.workspace_members;
create policy "workspace_members_owner_remove"
on public.workspace_members for delete to authenticated
using (auth.uid() = workspace_owner_id);

-- Replace existing workspace_state policies with explicit owner/member policies.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'workspace_state'
  loop
    execute format('drop policy if exists %I on public.workspace_state', p.policyname);
  end loop;
end $$;

create policy "workspace_state_read_owner_or_member"
on public.workspace_state for select to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.workspace_members m
    where m.workspace_owner_id = workspace_state.owner_id
      and m.member_user_id = auth.uid()
  )
);

create policy "workspace_state_insert_owner_or_member"
on public.workspace_state for insert to authenticated
with check (
  owner_id = auth.uid()
  or exists (
    select 1 from public.workspace_members m
    where m.workspace_owner_id = workspace_state.owner_id
      and m.member_user_id = auth.uid()
  )
);

create policy "workspace_state_update_owner_or_member"
on public.workspace_state for update to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.workspace_members m
    where m.workspace_owner_id = workspace_state.owner_id
      and m.member_user_id = auth.uid()
  )
)
with check (
  owner_id = auth.uid()
  or exists (
    select 1 from public.workspace_members m
    where m.workspace_owner_id = workspace_state.owner_id
      and m.member_user_id = auth.uid()
  )
);

create policy "workspace_state_delete_owner_or_member"
on public.workspace_state for delete to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.workspace_members m
    where m.workspace_owner_id = workspace_state.owner_id
      and m.member_user_id = auth.uid()
  )
);
