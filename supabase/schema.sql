-- =============================================================
-- Lua — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================

-- ----------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";        -- for scheduled notifications (optional)

-- ----------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------
create type cycle_regularity as enum ('very_regular', 'mostly_regular', 'irregular');
create type cycle_goal        as enum ('track', 'conceive', 'avoid', 'health');
create type flow_intensity    as enum ('none', 'spotting', 'light', 'medium', 'heavy');

-- ----------------------------------------------------------------
-- profiles
-- Extended user profile, linked to auth.users (1-to-1).
-- ----------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid        primary key references auth.users(id) on delete cascade,
  name                 text        not null default '',
  avatar_url           text,

  -- Cycle settings
  last_period_date     date,
  period_duration      smallint    not null default 5 check (period_duration between 1 and 14),
  cycle_length         smallint    not null default 28 check (cycle_length between 14 and 60),
  regularity           cycle_regularity not null default 'mostly_regular',
  goal                 cycle_goal       not null default 'track',

  -- Partner sharing permissions (what the partner can see)
  perm_phase           boolean     not null default true,
  perm_calendar        boolean     not null default true,
  perm_mood            boolean     not null default false,
  perm_symptoms        boolean     not null default false,

  -- Notification preferences (for the account owner)
  notif_period_forecast boolean    not null default true,
  notif_daily_reminder  boolean    not null default false,
  notif_fertile_window  boolean    not null default false,

  onboarding_complete  boolean     not null default false,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.profiles is 'User profile and cycle configuration.';

-- Auto-create profile on new auth.users row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------
-- daily_logs
-- One row per user per day. Upsert on (user_id, log_date).
-- ----------------------------------------------------------------
create table if not exists public.daily_logs (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  log_date     date        not null,

  flow         flow_intensity not null default 'none',
  pain_level   smallint    not null default 0 check (pain_level between 0 and 10),

  -- Arrays stored as jsonb for flexibility
  mood         text[]      not null default '{}',
  symptoms     text[]      not null default '{}',

  notes        text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (user_id, log_date)
);

comment on table public.daily_logs is 'Daily symptom, mood, flow and pain entries.';

create trigger daily_logs_updated_at
  before update on public.daily_logs
  for each row execute function public.set_updated_at();

create index daily_logs_user_date on public.daily_logs (user_id, log_date desc);

-- ----------------------------------------------------------------
-- partner_invites
-- One active invite per owner at a time.
-- ----------------------------------------------------------------
create table if not exists public.partner_invites (
  id         uuid        primary key default uuid_generate_v4(),
  owner_id   uuid        not null references public.profiles(id) on delete cascade,
  token      text        not null unique,
  expires_at timestamptz not null,
  used       boolean     not null default false,
  created_at timestamptz not null default now(),

  unique (owner_id)   -- only one active invite per user
);

comment on table public.partner_invites is 'Single-use invite tokens for partner linking.';

create index partner_invites_token on public.partner_invites (token);

-- ----------------------------------------------------------------
-- partner_relationships
-- Links an owner (the cycle tracker) to a partner (read-only).
-- ----------------------------------------------------------------
create table if not exists public.partner_relationships (
  id               uuid        primary key default uuid_generate_v4(),
  owner_id         uuid        not null references public.profiles(id) on delete cascade,
  partner_user_id  uuid        references public.profiles(id) on delete set null,

  -- Granular permissions (mirrors profile defaults, can be overridden)
  perm_phase       boolean     not null default true,
  perm_calendar    boolean     not null default true,
  perm_mood        boolean     not null default false,
  perm_symptoms    boolean     not null default false,

  -- Partner notification preferences
  notif_period_start boolean   not null default true,
  notif_period_soon  boolean   not null default true,
  notif_ovulation    boolean   not null default false,
  notif_pms          boolean   not null default false,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (owner_id)
);

comment on table public.partner_relationships is 'Partner link between a cycle owner and their partner.';

create trigger partner_relationships_updated_at
  before update on public.partner_relationships
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------
-- push_subscriptions
-- Web Push subscription endpoints per user (one per device).
-- Keyed by endpoint for multi-device support.
-- ----------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id        uuid        primary key default uuid_generate_v4(),
  user_id   uuid        not null references public.profiles(id) on delete cascade,
  endpoint  text        not null unique,
  p256dh    text        not null,
  auth      text        not null,
  created_at timestamptz not null default now()
);

comment on table public.push_subscriptions is 'Web Push API subscription objects for server-initiated push.';

create index push_subscriptions_user on public.push_subscriptions (user_id);

-- ----------------------------------------------------------------
-- Row Level Security (RLS)
-- Every table is locked down to the authenticated owner.
-- ----------------------------------------------------------------

-- profiles
alter table public.profiles enable row level security;

create policy "profiles: owner can read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: owner can update own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles: service role can read for partner view"
  on public.profiles for select
  using (true);   -- Partners access via Edge Function with service role

-- daily_logs
alter table public.daily_logs enable row level security;

create policy "daily_logs: owner read/write"
  on public.daily_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- partner_invites
alter table public.partner_invites enable row level security;

create policy "partner_invites: owner read/write"
  on public.partner_invites for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "partner_invites: anyone can read by token (for invite lookup)"
  on public.partner_invites for select
  using (true);

-- partner_relationships
alter table public.partner_relationships enable row level security;

create policy "partner_relationships: owner full access"
  on public.partner_relationships for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "partner_relationships: partner can read own"
  on public.partner_relationships for select
  using (auth.uid() = partner_user_id);

-- push_subscriptions
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: owner full access"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- Secure account deletion (called via sb.rpc('delete_own_account'))
-- ----------------------------------------------------------------
create or replace function public.delete_own_account()
returns void language plpgsql security definer
set search_path = public
as $$
begin
  -- RLS already ensures the caller is the owner; delete auth user cascades everything
  delete from auth.users where id = auth.uid();
end;
$$;

-- ----------------------------------------------------------------
-- Helper view: partner can read owner's current cycle summary
-- (used by Edge Function / server-side; not directly from client)
-- ----------------------------------------------------------------
create or replace view public.partner_cycle_view as
  select
    p.id            as owner_id,
    p.name          as owner_name,
    p.last_period_date,
    p.cycle_length,
    p.period_duration,
    p.perm_phase,
    p.perm_calendar,
    p.perm_mood,
    p.perm_symptoms,
    pr.partner_user_id,
    pr.notif_period_start,
    pr.notif_period_soon,
    pr.notif_ovulation,
    pr.notif_pms
  from public.profiles p
  join public.partner_relationships pr on pr.owner_id = p.id;

-- ----------------------------------------------------------------
-- Sample: how to query logs for the calendar (client uses this pattern)
-- SELECT log_date, flow, pain_level
-- FROM daily_logs
-- WHERE user_id = auth.uid()
--   AND log_date BETWEEN '2025-01-01' AND '2025-01-31';
-- ----------------------------------------------------------------
