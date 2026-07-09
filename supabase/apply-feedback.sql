-- In-app user feedback: experience rating, problems, suggestions.
-- Users insert their own entries; only platform admins read and triage.
-- Run once in the Supabase SQL Editor. Idempotent.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  user_email text,
  rating smallint check (rating between 1 and 5),
  category text not null default 'other' check (category in ('problem', 'idea', 'other')),
  message text not null,
  module text,
  page text,
  user_agent text,
  status text not null default 'new' check (status in ('new', 'reviewed')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.feedback enable row level security;

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own"
on public.feedback
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "feedback_admin_read" on public.feedback;
create policy "feedback_admin_read"
on public.feedback
for select
to authenticated
using (public.is_admin());

drop policy if exists "feedback_admin_update" on public.feedback;
create policy "feedback_admin_update"
on public.feedback
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
