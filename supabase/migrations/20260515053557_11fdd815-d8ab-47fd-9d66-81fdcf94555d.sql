
-- Enums
create type public.client_status as enum ('new_consultation', 'active', 'inactive');
create type public.wig_status as enum ('available', 'reserved', 'sent_for_repair', 'sold');
create type public.hair_type as enum ('human', 'synthetic');
create type public.workflow_type as enum ('sale_cut', 'wash_set');
create type public.workflow_status as enum ('open', 'completed', 'cancelled');
create type public.step_status as enum ('pending', 'in_progress', 'completed', 'skipped');
create type public.appointment_type as enum ('consultation', 'cut', 'wash_set', 'pickup');
create type public.appointment_status as enum ('scheduled', 'confirmed', 'completed', 'no_show', 'cancelled');
create type public.repair_status as enum ('sent_to_vendor', 'in_progress', 'returned', 'issue');
create type public.payment_method as enum ('cash', 'check', 'credit_card', 'zelle', 'other');
create type public.payment_category as enum ('wig_sale', 'cut', 'wash_set', 'repair', 'other');
create type public.bank_account_type as enum ('bank', 'cc_processor');

-- Profiles (staff)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Clients
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  status public.client_status not null default 'new_consultation',
  measurements jsonb not null default '{}'::jsonb,
  preferences text,
  notes text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clients enable row level security;
create index on public.clients (status);
create index on public.clients (full_name);

-- Wigs
create table public.wigs (
  id uuid primary key default gen_random_uuid(),
  wig_code text unique,
  brand text,
  style text,
  color text,
  cap_size text,
  hair_type public.hair_type,
  price numeric(10,2) default 0,
  cost numeric(10,2) default 0,
  quantity integer not null default 1,
  status public.wig_status not null default 'available',
  reserved_for_client_id uuid references public.clients(id) on delete set null,
  photos text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wigs enable row level security;
create index on public.wigs (status);

-- Custom orders
create table public.custom_orders (
  id uuid primary key default gen_random_uuid(),
  wig_id uuid references public.wigs(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  vendor text,
  specs text,
  expected_delivery date,
  received_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.custom_orders enable row level security;

-- Service workflows
create table public.service_workflows (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  wig_id uuid references public.wigs(id) on delete set null,
  type public.workflow_type not null,
  status public.workflow_status not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.service_workflows enable row level security;
create index on public.service_workflows (client_id);

-- Workflow steps
create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.service_workflows(id) on delete cascade,
  step_key text not null,
  step_label text not null,
  step_order integer not null,
  status public.step_status not null default 'pending',
  notes text,
  data jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workflow_steps enable row level security;
create index on public.workflow_steps (workflow_id);

-- Appointments
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_id uuid references public.service_workflows(id) on delete set null,
  workflow_step_id uuid references public.workflow_steps(id) on delete set null,
  type public.appointment_type not null,
  status public.appointment_status not null default 'scheduled',
  starts_at timestamptz not null,
  ends_at timestamptz,
  notes text,
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.appointments enable row level security;
create index on public.appointments (starts_at);
create index on public.appointments (client_id);

-- Repairs
create table public.repairs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  wig_id uuid references public.wigs(id) on delete set null,
  workflow_id uuid references public.service_workflows(id) on delete set null,
  vendor text not null,
  work_requested text,
  cost numeric(10,2) default 0,
  date_sent date not null default current_date,
  expected_return date,
  actual_return date,
  status public.repair_status not null default 'sent_to_vendor',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.repairs enable row level security;
create index on public.repairs (status);

-- Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  bank_account_id uuid,
  date date not null default current_date,
  amount numeric(12,2) not null,
  method public.payment_method not null default 'cash',
  category public.payment_category not null default 'other',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payments enable row level security;
create index on public.payments (date);

-- Bank accounts
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.bank_account_type not null default 'bank',
  starting_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bank_accounts enable row level security;

alter table public.payments add constraint payments_bank_account_fk foreign key (bank_account_id) references public.bank_accounts(id) on delete set null;

-- Bank transactions
create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  date date not null,
  amount numeric(12,2) not null,
  description text,
  matched_payment_id uuid references public.payments(id) on delete set null,
  is_matched boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bank_transactions enable row level security;
create index on public.bank_transactions (bank_account_id, date);

-- Activity log
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  type text not null,
  ref_table text,
  ref_id uuid,
  summary text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.activity_log enable row level security;
create index on public.activity_log (client_id, created_at desc);

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array['profiles','clients','wigs','custom_orders','service_workflows','workflow_steps','appointments','repairs','payments','bank_accounts','bank_transactions']) loop
    execute format('create trigger trg_%I_touch before update on public.%I for each row execute function public.touch_updated_at();', t, t);
  end loop;
end$$;

-- Profile autocreate
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: any authenticated staff user has full access
do $$
declare t text;
begin
  for t in select unnest(array['profiles','clients','wigs','custom_orders','service_workflows','workflow_steps','appointments','repairs','payments','bank_accounts','bank_transactions','activity_log']) loop
    execute format('create policy "auth read %1$s" on public.%1$I for select to authenticated using (true);', t);
    execute format('create policy "auth insert %1$s" on public.%1$I for insert to authenticated with check (true);', t);
    execute format('create policy "auth update %1$s" on public.%1$I for update to authenticated using (true) with check (true);', t);
    execute format('create policy "auth delete %1$s" on public.%1$I for delete to authenticated using (true);', t);
  end loop;
end$$;

-- Storage buckets
insert into storage.buckets (id, name, public) values ('client-photos','client-photos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('wig-photos','wig-photos', true) on conflict (id) do nothing;

create policy "auth read client photos" on storage.objects for select to authenticated using (bucket_id = 'client-photos');
create policy "auth write client photos" on storage.objects for insert to authenticated with check (bucket_id = 'client-photos');
create policy "auth update client photos" on storage.objects for update to authenticated using (bucket_id = 'client-photos');
create policy "auth delete client photos" on storage.objects for delete to authenticated using (bucket_id = 'client-photos');

create policy "auth read wig photos" on storage.objects for select to authenticated using (bucket_id = 'wig-photos');
create policy "auth write wig photos" on storage.objects for insert to authenticated with check (bucket_id = 'wig-photos');
create policy "auth update wig photos" on storage.objects for update to authenticated using (bucket_id = 'wig-photos');
create policy "auth delete wig photos" on storage.objects for delete to authenticated using (bucket_id = 'wig-photos');

create policy "public read client photos" on storage.objects for select to anon using (bucket_id = 'client-photos');
create policy "public read wig photos" on storage.objects for select to anon using (bucket_id = 'wig-photos');
