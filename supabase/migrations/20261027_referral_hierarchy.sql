-- Team Work CRM: referral hierarchy foundation
-- Apply in Supabase SQL Editor before enabling the referral login UI.
create extension if not exists pgcrypto;

create table if not exists public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  referral_id char(6) not null unique
    check (referral_id ~ '^[0-9]{6}$'),
  sponsor_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  phone text not null,
  designation text not null default 'Associate',
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  constraint member_profiles_not_self_sponsor check (sponsor_user_id is null or sponsor_user_id <> user_id)
);

create unique index if not exists member_profiles_phone_unique_idx
  on public.member_profiles(phone);

create index if not exists member_profiles_workspace_idx
  on public.member_profiles(workspace_owner_id);
create index if not exists member_profiles_sponsor_idx
  on public.member_profiles(sponsor_user_id);
create index if not exists member_profiles_approval_idx
  on public.member_profiles(workspace_owner_id, approval_status);

alter table public.member_profiles enable row level security;

-- Members can read their own profile; Main Admin can read profiles in their workspace.
drop policy if exists "profile self or workspace admin read" on public.member_profiles;
create policy "profile self or workspace admin read"
on public.member_profiles for select to authenticated
using (
  user_id = auth.uid()
  or workspace_owner_id = auth.uid()
);

-- Direct reports only. Workspace owner is the Main Admin and sees all profiles.
drop policy if exists "direct sponsor reads direct reports" on public.member_profiles;
create policy "direct sponsor reads direct reports"
on public.member_profiles for select to authenticated
using (
  sponsor_user_id = auth.uid()
  or workspace_owner_id = auth.uid()
);

-- No client-side inserts/updates/deletes: trusted Edge Function performs these actions.
drop policy if exists "no client profile writes" on public.member_profiles;
create policy "no client profile writes"
on public.member_profiles for all to authenticated
using (false) with check (false);

-- Prevent exposing auth email/password lookup via a public SQL function.
-- Referral ID assignment and approval must happen in a trusted Edge Function
-- using SUPABASE_SERVICE_ROLE_KEY stored only as a server secret.
