
-- Audit action enum
do $$ begin
  create type public.audit_action as enum ('create', 'update', 'delete', 'view', 'void');
exception when duplicate_object then null; end $$;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  user_name text,
  ip_address text,
  action public.audit_action not null,
  module text not null,
  record_id uuid,
  record_label text,
  summary text not null,
  before jsonb,
  after jsonb,
  changes jsonb
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_module_idx on public.audit_logs (module);
create index if not exists audit_logs_record_idx on public.audit_logs (record_id);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id);

alter table public.audit_logs enable row level security;

-- All authenticated users can read audit logs
drop policy if exists "auth read audit_logs" on public.audit_logs;
create policy "auth read audit_logs" on public.audit_logs
  for select to authenticated using (true);

-- All authenticated users can insert audit logs (writes happen from app code)
drop policy if exists "auth insert audit_logs" on public.audit_logs;
create policy "auth insert audit_logs" on public.audit_logs
  for insert to authenticated with check (true);

-- No update / delete policies = denied for everyone (immutable)

-- Payment voiding
alter table public.payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text;
