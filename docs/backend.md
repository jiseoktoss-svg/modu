# modu 백엔드 구현 문서

## 1. 백엔드 목표

modu의 백엔드는 로그인 없는 링크 기반 알파 서비스에 맞춰, 토큰 기반 접근 제어와 설명 가능한 추천 계산을 제공한다.

핵심 목표:

- 회의, 참석자, 응답, 후보 투표, 확정 정보를 안정적으로 저장한다.
- 참석자 링크를 생성하고, admin token은 내부 관리/확정 권한 검증에 사용한다.
- 참석자는 같은 브라우저에서만 본인 응답을 수정할 수 있다.
- 참석자는 전원 응답 후 후보 시간대에 투표할 수 있다.
- 주최자는 admin token으로만 추천 확인과 최다 득표 후보 확정을 수행한다.
- 추천 알고리즘은 UI와 분리해 테스트 가능하게 만든다.

## 2. 기술 기준

- Next.js App Router
- TypeScript
- Supabase Postgres
- Supabase 접근은 서버에서만 수행
- 추천 알고리즘은 `lib/scheduler`에 구현
- `.ics` 다운로드는 Route Handler로 구현

브라우저에는 Supabase service role key 또는 secret key를 절대 노출하지 않는다.

## 3. 환경변수

배포 시 필수:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

선택:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

호환 목적 fallback:

```env
SUPABASE_SERVICE_ROLE_KEY=
```

서버 클라이언트는 `SUPABASE_SECRET_KEY`를 우선 사용하고, 없을 경우 `SUPABASE_SERVICE_ROLE_KEY`를 사용할 수 있다. 두 값 모두 브라우저 번들에 포함되면 안 된다.

개발 모드에서 Supabase 환경변수가 없으면 `.modu-local-db.json` 파일 저장소를 자동으로 사용한다. 배포 환경에서는 Supabase 환경변수가 없으면 에러로 처리한다.

## 4. 데이터 모델

DB 컬럼명은 Supabase/Postgres 기준으로 snake_case를 사용한다.

### meetings

| 컬럼 | 설명 |
| --- | --- |
| `id` | 회의 ID |
| `title` | 회의명 |
| `agenda` | 안건 |
| `location` | 장소 |
| `duration_minutes` | 회의 길이 |
| `date_start` | 생성일 기준 오늘 날짜 |
| `date_end` | 회의 마감 날짜 |
| `workday_start` | 내부 계산용 근무 시작 시간, 기본 `09:00` |
| `workday_end` | 내부 계산용 근무 종료 시간, 기본 `18:00` |
| `lunch_start` | 내부 계산값. 신규 회의는 점심 제외 비활성화를 위해 `00:00` 저장 |
| `lunch_end` | 내부 계산값. 신규 회의는 점심 제외 비활성화를 위해 `00:01` 저장 |
| `admin_token` | 주최자 관리 토큰 |
| `confirmed_slot_id` | 확정 슬롯 ID |
| `created_at` | 생성일 |
| `expires_at` | 만료 예정일 |

### participants

| 컬럼 | 설명 |
| --- | --- |
| `id` | 참석자 ID |
| `meeting_id` | 회의 ID |
| `name` | 이름 |
| `role` | 역할 |
| `attendance_type` | `required` 또는 `optional` |
| `response_status` | `pending` 또는 `submitted` |
| `participant_token` | 참석자 수정 토큰 |
| `created_at` | 생성일 |
| `updated_at` | 수정일 |

### availability_blocks

| 컬럼 | 설명 |
| --- | --- |
| `id` | 가능 여부 블록 ID |
| `meeting_id` | 회의 ID |
| `participant_id` | 참석자 ID |
| `start_at` | 시작 시각 |
| `end_at` | 종료 시각 |
| `status` | `busy`, `avoid`, `preferred` |
| `note` | 선택 메모 |
| `created_at` | 생성일 |

### meeting_votes

| 컬럼 | 설명 |
| --- | --- |
| `id` | 투표 ID |
| `meeting_id` | 회의 ID |
| `participant_id` | 참석자 ID |
| `start_at` | 투표한 후보 시작 시각 |
| `end_at` | 투표한 후보 종료 시각 |
| `created_at` | 생성일 |

참석자 1명은 회의 1개당 하나의 후보에만 투표할 수 있다. 다시 투표하면 기존 투표를 삭제하고 새 투표를 저장한다.

### confirmed_slots

| 컬럼 | 설명 |
| --- | --- |
| `id` | 확정 슬롯 ID |
| `meeting_id` | 회의 ID |
| `start_at` | 시작 시각 |
| `end_at` | 종료 시각 |
| `summary_text` | 공유용 요약 문구 |
| `created_at` | 생성일 |

## 5. Supabase 테이블 생성 SQL

```sql
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
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  check (date_start <= date_end),
  check (workday_start < workday_end),
  check (lunch_start < lunch_end)
);

alter table meetings add column if not exists agenda text not null default '';
alter table meetings add column if not exists location text not null default '';

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

alter table meetings enable row level security;
alter table participants enable row level security;
alter table availability_blocks enable row level security;
alter table confirmed_slots enable row level security;
alter table meeting_votes enable row level security;

revoke all on meetings from anon, authenticated;
revoke all on participants from anon, authenticated;
revoke all on availability_blocks from anon, authenticated;
revoke all on confirmed_slots from anon, authenticated;
revoke all on meeting_votes from anon, authenticated;

grant all on meetings to service_role;
grant all on participants to service_role;
grant all on availability_blocks to service_role;
grant all on confirmed_slots to service_role;
grant all on meeting_votes to service_role;
```

## 6. 서버 액션 및 Route Handler

권장 서버 기능:

- `createMeeting`
  - 회의명, 안건, 장소, 회의 마감 날짜, 회의 길이, 참석자를 생성한다.
  - 회의 길이는 시간과 분 입력값을 합산해 `duration_minutes`로 저장한다.
  - 주최자에게 근무 시작/종료 시간과 점심 시간은 받지 않고 서버 기본값을 저장한다.
  - `meetingId`, `adminToken`, 참석자별 `participantToken`을 생성한다.
  - 생성 후 공유 화면으로 이동한다.

- `verifyParticipantIdentity`
  - 링크로 들어온 참석자의 이름과 직무가 실제 참석자 명단에 있는지 검증한다.
  - 명단과 일치하지 않으면 응답 입력 화면으로 이동시키지 않는다.
  - 이미 제출한 참석자는 같은 브라우저의 `participantToken`이 있을 때만 수정할 수 있다.

- `submitAvailability`
  - 참석자 응답을 저장한다.
  - 기존 응답 수정 시 `participantId`와 `participantToken`을 검증한다.
  - 확정된 회의에서는 응답을 수정할 수 없다.
  - 해당 참석자의 기존 `availability_blocks`를 교체한다.
  - `response_status`를 `submitted`로 변경한다.
  - 응답이 바뀌면 해당 회의의 후보 투표를 초기화한다.

- `loadCalendarSnapshot`
  - 참석자 `participantToken`을 검증한다.
  - 응답 제출 후 참석자용 시간축 캘린더에 필요한 참석자 목록과 가능 여부 블록을 반환한다.
  - 참석자별 상세 메모와 블록 note 원문은 반환하지 않는다.
  - 반환 데이터는 가능/선호/불가능/미응답 집계를 만들기 위한 최소 정보로 제한한다.

- `updateAttendanceType`
  - admin token을 검증한다.
  - 참석자의 필수/선택 여부를 변경한다.
  - 확정된 회의에서는 참석 유형을 변경할 수 없다.
  - 변경 후 추천 결과가 다시 계산될 수 있게 후보 투표를 초기화한다.

- `loadVotingOptions`
  - 참석자 `participantToken`을 검증한다.
  - 모든 참석자가 응답했을 때만 추천 후보를 투표 옵션으로 반환한다.
  - 후보별 현재 투표 수와 본인 투표 여부를 함께 반환한다.

- `submitVote`
  - 참석자 `participantToken`을 검증한다.
  - 모든 참석자가 응답한 뒤에만 투표를 저장한다.
  - 참석자당 1표만 유지한다.
  - 확정된 회의에서는 투표를 받지 않는다.

- `confirmSlot`
  - admin token을 검증한다.
  - 모든 참석자가 응답하고 모든 참석자의 후보 투표가 모였는지 검증한다.
  - 최다 득표 후보를 `confirmed_slots`에 저장한다. 동률이면 주최자가 고른 후보를 저장한다.
  - `meetings.confirmed_slot_id`를 업데이트한다.

- `createSampleMeeting`
  - 샘플 회의, 참석자, 응답 데이터를 생성한다.
  - 생성된 admin 결과 화면으로 이동한다.

Route Handler:

- `GET /api/meetings/[meetingId]/ics`
  - 확정된 회의가 있을 때만 `.ics` 파일을 반환한다.
  - 확정 전이면 404 또는 안내성 에러를 반환한다.

## 7. 추천 알고리즘

추천 알고리즘은 UI와 분리해 `lib/scheduler`에 구현한다.

권장 파일:

```txt
lib/scheduler/
  generateSlots.ts
  scoreSlots.ts
  explainRecommendation.ts
  types.ts
  index.ts
```

### 후보 생성

- 회의 날짜 내에서 후보 슬롯을 생성한다.
- 근무 시간 안에서만 생성한다.
- 30분 단위로 시작 시간을 생성한다.
- 회의 길이는 기본 60분이다.
- 저장된 회의에 점심 제외 시간이 활성화되어 있으면 점심 시간과 겹치는 슬롯은 제외한다. 신규 회의는 점심 시간을 입력받지 않고 09:00~18:00 전체를 후보 범위로 쓴다.

### 제외 규칙

다음 조건에 해당하면 후보에서 제외한다.

- 필수 참석자의 `busy`와 겹치는 경우
- 활성화된 점심 제외 시간과 겹치는 경우
- 근무 시간 밖인 경우

### 감점 규칙

다음 조건은 후보에서 제외하지 않고 감점한다.

- 선택 참석자의 `busy`와 겹침
- 참석자의 `avoid`와 겹침
- 점심 제외 시간이 활성화된 회의에서 점심 직후 시간대와 겹침. 신규 회의는 점심 제외가 비활성화되어 이 감점이 사실상 적용되지 않는다.

미응답자가 있는 경우에는 후보를 제외하지 않고, 추천 카드에 `미응답자 있음` 상태를 표시한다.

### 가점 규칙

다음 조건은 가점한다.

- 참석자의 `preferred`와 겹침
- 필수 참석자가 모두 가능함
- 선택 참석자도 많이 참석 가능함
- 비선호 충돌이 적음

### 후보 투표 및 확정

- 모든 참석자가 `submitted` 상태가 되기 전에는 투표 옵션을 반환하지 않는다.
- 참석자 1명은 후보 1개에 투표할 수 있고, 다시 투표하면 기존 투표를 교체한다.
- 모든 참석자의 투표가 모이면 후보별 투표 수를 계산한다.
- 확정은 주최자만 수행한다(자동 확정하지 않는다).
- 주최자는 최다 득표 후보를 확정할 수 있다. 1위가 동률이면 그중 하나를 골라 확정한다.
- 참석자가 응답을 수정하면 후보 투표를 초기화하고, 확정된 회의에서는 응답·투표를 잠근다.

### 추천 설명

추천 결과에는 숫자 점수만 보여주지 않는다. 반드시 사람이 이해할 수 있는 한국어 추천 이유를 생성한다.

예시:

- `필수 참석자 4명이 모두 가능하고, 불가능 시간 충돌이 없습니다.`
- `선택 참석자 1명이 참석하기 어렵지만, 필수 참석자는 모두 가능합니다.`
- `전원 참석 가능하지만 비선호 조건이 있어 우선순위를 낮췄습니다.`
- `아직 2명이 응답하지 않았지만, 현재 응답 기준으로는 가장 충돌이 적은 시간입니다.`

## 8. 권한 및 보안 정책

이번 버전은 로그인 없는 링크 기반 알파다.

권한 원칙:

- 참석자 링크를 가진 사람은 응답 화면에 접근할 수 있다.
- admin token이 포함된 주최자 화면에서만 추천 결과 확인과 최다 득표 후보 확정이 가능하다.
- 참석자 수정은 같은 브라우저에 저장된 `participantToken`이 있을 때만 허용한다.
- Supabase secret/service role key는 서버에서만 사용한다.
- 브라우저에는 민감한 key를 노출하지 않는다.

Supabase 정책:

- 모든 public 테이블에 RLS를 활성화한다.
- 브라우저에서 직접 테이블을 읽고 쓰지 않는다.
- `anon`, `authenticated`의 직접 테이블 접근은 제한한다.
- 서버 액션 또는 Route Handler가 token 검증 후 DB 작업을 수행한다.

## 9. 백엔드 테스트 시나리오

추천 알고리즘 단위 테스트:

- 점심 제외 시간이 활성화된 회의에서는 점심 시간과 겹치는 후보가 제외된다.
- 필수 참석자의 `busy`와 겹치는 후보는 제외된다.
- 선택 참석자의 `busy`와 겹치는 후보는 제외되지 않고 감점된다.
- `avoid`는 감점된다.
- `preferred`는 가점된다.
- 점심 제외 시간이 활성화된 회의에서는 점심 직후 시간대가 감점된다.
- `loadCalendarSnapshot`은 토큰 검증 후 캘린더 집계용 데이터만 반환하고 메모 원문은 반환하지 않는다.
- 미응답자가 있으면 추천 카드에 상태가 표시된다.

서버 로직 테스트:

- 회의 생성 시 admin token과 participant token이 생성된다.
- 참석자 첫 제출이 저장된다.
- 같은 `participantToken`으로 기존 응답을 수정할 수 있다.
- 잘못된 `participantToken`으로 수정할 수 없다.
- 모든 참석자가 응답하기 전에는 후보 투표를 할 수 없다.
- 참석자당 후보 투표는 1표만 유지된다.
- 잘못된 `adminToken`으로 참석 유형 변경이나 다수결 확정을 할 수 없다.
- 전원 투표 전에는 확정할 수 없다. 1위가 동률이면 주최자가 후보를 골라 확정한다.
- 확정된 회의에서는 응답·투표를 수정할 수 없다.
- 확정된 회의만 `.ics` 파일을 다운로드할 수 있다.

## 10. 구현 완료 후 README 정리 항목

구현 완료 후 루트 `README.md`에 다음 내용을 정리한다.

- 실행 방법
- 필요한 환경변수
- 주요 화면 경로
- Supabase 테이블 생성 SQL
- 추천 알고리즘 동작 방식
- 현재 구현된 기능
- 아직 제외한 기능
- 다음 개선 우선순위
