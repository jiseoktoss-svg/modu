-- modu 알파 스키마
-- Supabase SQL Editor 에 그대로 붙여 실행한다.
-- 모든 접근은 서버(service_role)에서만 수행하며, anon/authenticated 직접 접근은 차단한다.

create extension if not exists pgcrypto;

do $$ begin
  create type attendance_type as enum ('required', 'optional');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type response_status as enum ('pending', 'submitted');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type availability_status as enum ('busy', 'avoid', 'preferred');
exception
  when duplicate_object then null;
end $$;

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  agenda text not null default '',
  location text not null default '',
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  date_start date not null,
  date_end date not null,
  workday_start time not null default '09:00',
  workday_end time not null default '18:00',
  lunch_start time not null default '12:00',
  lunch_end time not null default '13:00',
  admin_token text not null unique,
  confirmed_slot_id uuid,
  -- 응답 마감 시각(ISO). 미설정이면 null.
  response_deadline timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  check (date_start <= date_end),
  check (workday_start < workday_end),
  check (lunch_start < lunch_end)
);

alter table meetings add column if not exists agenda text not null default '';
alter table meetings add column if not exists location text not null default '';
alter table meetings add column if not exists response_deadline timestamptz;

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  name text not null,
  role text not null default '',
  attendance_type attendance_type not null default 'optional',
  response_status response_status not null default 'pending',
  participant_token text not null unique,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 배포(이미 participants 가 있는 경우)를 위한 멱등 마이그레이션.
alter table participants add column if not exists memo text;

create table if not exists availability_blocks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status availability_status not null,
  note text,
  created_at timestamptz not null default now(),
  check (start_at < end_at)
);

create table if not exists confirmed_slots (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  summary_text text not null,
  created_at timestamptz not null default now(),
  check (start_at < end_at)
);

create table if not exists meeting_votes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (start_at < end_at),
  unique (meeting_id, participant_id)
);

create table if not exists tracking_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in ('page_view', 'screen_view')),
  page_path text not null,
  page_label text not null,
  meeting_id text,
  ip_hash text,
  visitor_id text,
  session_id text,
  referrer text,
  user_agent text,
  device_type text not null default 'unknown',
  viewport_width integer,
  created_at timestamptz not null default now()
);

alter table tracking_events
  add column if not exists ip_hash text;

alter table meetings
  drop constraint if exists meetings_confirmed_slot_id_fkey;
alter table meetings
  add constraint meetings_confirmed_slot_id_fkey
  foreign key (confirmed_slot_id)
  references confirmed_slots(id)
  on delete set null;

create index if not exists participants_meeting_id_idx
  on participants(meeting_id);

create index if not exists availability_blocks_meeting_id_idx
  on availability_blocks(meeting_id);

create index if not exists availability_blocks_participant_id_idx
  on availability_blocks(participant_id);

create index if not exists availability_blocks_time_idx
  on availability_blocks(start_at, end_at);

create index if not exists confirmed_slots_meeting_id_idx
  on confirmed_slots(meeting_id);

create index if not exists meeting_votes_meeting_id_idx
  on meeting_votes(meeting_id);

create index if not exists meeting_votes_slot_idx
  on meeting_votes(meeting_id, start_at, end_at);

create index if not exists tracking_events_created_at_idx
  on tracking_events(created_at desc);

create index if not exists tracking_events_page_idx
  on tracking_events(page_path, created_at desc);

create index if not exists tracking_events_meeting_idx
  on tracking_events(meeting_id, created_at desc)
  where meeting_id is not null;

create index if not exists tracking_events_ip_hash_idx
  on tracking_events(ip_hash, created_at desc)
  where ip_hash is not null;

alter table meetings enable row level security;
alter table participants enable row level security;
alter table availability_blocks enable row level security;
alter table confirmed_slots enable row level security;
alter table meeting_votes enable row level security;
alter table tracking_events enable row level security;

revoke all on meetings from anon, authenticated;
revoke all on participants from anon, authenticated;
revoke all on availability_blocks from anon, authenticated;
revoke all on confirmed_slots from anon, authenticated;
revoke all on meeting_votes from anon, authenticated;
revoke all on tracking_events from anon, authenticated;

grant all on meetings to service_role;
grant all on participants to service_role;
grant all on availability_blocks to service_role;
grant all on confirmed_slots to service_role;
grant all on meeting_votes to service_role;
grant all on tracking_events to service_role;
