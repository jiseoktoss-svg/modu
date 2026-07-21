# modu 백엔드 구현 문서

## 1. 백엔드 목표

modu의 백엔드는 로그인 없는 링크 기반 알파 서비스에 맞춰, 토큰 기반 접근 제어와 설명 가능한 후보 계산을 제공한다.

핵심 목표:

- 일정, 참여자, 응답, legacy 확정 정보를 안정적으로 저장한다.
- 공용 링크에서 참여자를 등록하고 참여자별 수정 토큰을 생성한다.
- 참여자는 같은 브라우저에서만 본인 응답을 수정할 수 있다.
- 일정 생성자는 참여자 중 한 명일 뿐이며, 별도 관리자 권한을 갖지 않는다.
- **투표도 자동 확정도 없다.** modu는 함께할 시간을 확정하지 않는다. 열람 조건이 충족되면 전체 응답을 해석해 캘린더와 판단 근거를 보여주고, 최종 시간은 참여자들이 제품 밖에서 정한다.
- 후보 계산 알고리즘은 UI와 분리해 테스트 가능하게 만든다.

## 2. 기술 기준

- Next.js App Router
- TypeScript
- Supabase Postgres
- Supabase 접근은 서버에서만 수행
- 후보 계산 알고리즘은 `lib/scheduler`에 구현
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

개발 모드에서 Supabase 환경변수가 없으면 `.modu-local-db.json` 파일 저장소를 자동으로 사용한다. 배포 환경에서 Supabase 환경변수가 없으면 제품 흐름 확인을 위해 데모 회의 ID 기반 링크 생성 화면으로 이동한다. 이 데모 링크는 실제 DB 저장이 아니며, Supabase 환경변수를 설정하면 실제 저장 흐름으로 동작한다.

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
| `workday_start` | 내부 계산용 하루 시작 시간, 기본 `00:00` |
| `workday_end` | 내부 계산용 하루 종료 시간, 기본 `24:00` |
| `lunch_start` | 내부 계산값. 신규 회의는 점심 제외 비활성화를 위해 `00:00` 저장 |
| `lunch_end` | 내부 계산값. 신규 회의는 점심 제외 비활성화를 위해 `00:01` 저장 |
| `admin_token` | 기존 DB 호환을 위해 남긴 내부 저장 컬럼. 제품 권한이나 화면 노출에는 사용하지 않는다 |
| `confirmed_slot_id` | 확정 슬롯 ID |
| `created_at` | 생성일 |
| `expires_at` | 만료 예정일. 데이터 보존 정책용 내부 값이며, 화면에는 만료/삭제 안내를 노출하지 않는다 |
| `response_deadline` | 응답 마감 시각(`timestamptz`, nullable). 참여자 응답을 받는 마감이며, 회의 마감 날짜(`date_end`) 이전이어야 한다. 회의 안내·대기 화면에 노출 |

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

### meeting_votes (deprecated)

투표 개념 제거로 **앱은 이 테이블을 더 이상 읽거나 쓰지 않는다.**
기존 배포 DB 호환과 롤백 가능성을 위해 테이블 자체는 남겨 두었고, 안정화 후 drop 마이그레이션을 검토한다.

| 컬럼 | 설명 |
| --- | --- |
| `id` | ID |
| `meeting_id` | 회의 ID |
| `participant_id` | 참석자 ID |
| `start_at` | 후보 시작 시각 |
| `end_at` | 후보 종료 시각 |
| `created_at` | 생성일 |

### confirmed_slots (legacy)

**신규 캘린더 플로우에서는 서버가 이 테이블을 생성하지 않는다**(`meetings.confirmed_slot_id`도 업데이트하지 않음).
기존 데이터 호환·confirmed 화면/ICS 코드 보존·향후 확정 기능을 옵션으로 되살릴 가능성을 위해 테이블과 조회 분기는 유지한다.

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
  workday_start time not null default '00:00',
  workday_end time not null default '24:00',
  lunch_start time not null default '12:00',
  lunch_end time not null default '13:00',
  admin_token text not null unique,
  confirmed_slot_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  response_deadline timestamptz,
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
  join_key text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table participants add column if not exists memo text;
alter table participants add column if not exists join_key text;
create unique index if not exists participants_meeting_join_key_unique
  on participants(meeting_id, join_key)
  where join_key is not null;

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
  - 일정 이름, 내용, 장소, 일정 후보 마지막 날, 응답 마감일, 소요 시간을 저장한다.
  - 모든 항목이 필수다. 일정 이름·내용·장소가 비어 있으면 각각 에러를 반환한다.
  - 일정 이름은 공백 포함 최대 20글자, 내용은 공백 포함 최대 30글자, 장소는 공백 포함 최대 20글자까지 허용한다.
  - 소요 시간은 `durationHours`와 `durationMinutePart`를 합산해 `duration_minutes`로 저장한다. 분은 0~59 정수여야 한다.
  - 일정 후보 마지막 날(`deadlineDate`)은 `date_end`로 저장하고, `date_start`는 생성 시점의 오늘(KST) 날짜로 채운다. 마지막 날이 **오늘부터 이틀 뒤 이전이면** 에러를 반환한다.
  - 응답 마감일을 KST ISO로 합쳐 `response_deadline`에 저장한다. 오늘 이전이거나 **일정 후보 마지막 날 2일 전보다 늦으면** 에러를 반환한다.
  - 일정 생성자에게 별도 운영 시간이나 점심 시간을 받지 않고, 주말을 포함한 00:00~24:00 전체를 후보 범위로 저장한다.
  - 생성 단계에서는 참여자를 저장하지 않는다.
  - `meetingId`를 생성하고 공용 링크를 만든다.
  - 생성 후 공유 화면으로 이동한다.
  - 배포 환경에서 Supabase 환경변수가 없으면 실제 DB 저장 대신 데모 회의 ID를 생성해 공유 화면으로 이동한다.

- `joinMeeting`
  - 공용 링크로 들어온 사람의 이름이나 별명을 참여자로 자동 등록한다.
  - 정리된 이름 키(`join_key`)로 같은 일정 안의 중복 이름을 막고, 최대 8명까지 허용한다.
  - 새 참여자는 기본 `optional`로 저장해 모두 같은 조건에서 시작한다.
  - 등록 시 `participantToken`을 발급하고, 같은 브라우저에서 응답을 이어서 수정할 때 사용한다.

- `submitAvailability`
  - 참여자 응답을 저장한다.
  - 기존 응답 수정 시 `participantId`와 `participantToken`을 검증한다.
  - 확정된 회의에서는 응답을 수정할 수 없다.
  - 해당 참석자의 기존 `availability_blocks`를 교체한다.
  - `response_status`를 `submitted`로 변경한다.
  - 저장까지가 책임이다 — 투표도 자동 확정도 하지 않는다(현재 결과 캘린더가 전체 응답을 해석해 보여준다).

- `loadCalendarSnapshot`
  - 참석자 `participantToken`을 검증한다.
  - 응답 제출 후 참석자용 회의 캘린더에 필요한 참석자 목록과 가능 여부 블록을 반환한다.
  - 참석자별 상세 메모와 블록 note 원문은 반환하지 않는다.
  - 반환 데이터는 가능/선호/불가능/미응답 집계를 만들기 위한 최소 정보로 제한한다.

- 확정 관련 서버 로직은 없다.
  - 신규 플로우에서 서버는 `confirmed_slots`를 생성하지 않고 `meetings.confirmed_slot_id`를 업데이트하지 않는다.
  - 결과 해석(`evaluateAllSlots → buildContextualScheduleResult`)은 화면(현재 케이스 데모/향후 실데이터)이 담당한다.
  - `confirmed_slots`/`confirmed_slot_id`는 legacy 데이터 호환용으로만 조회한다(기존 확정 회의 표시·응답 잠금).

Route Handler:

- `GET /api/meetings/[meetingId]/ics`
  - 확정된 회의가 있을 때만 `.ics` 파일을 반환한다.
  - 확정 전이면 404 또는 안내성 에러를 반환한다.

## 7. 후보 계산 알고리즘

후보 계산 알고리즘은 UI와 분리해 `lib/scheduler`에 구현한다.

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
- 주말을 포함한 모든 날의 00:00~24:00 범위에서 생성한다.
- 30분 단위로 시작 시간을 생성한다.
- 회의 길이는 기본 60분이다.
- 저장된 기존 회의에 점심 제외 시간이 활성화되어 있으면 점심 시간과 겹치는 슬롯은 제외한다. 신규 일정은 점심 시간을 제외하지 않고 00:00~24:00 전체를 후보 범위로 쓴다.

### 제외 규칙

다음 조건에 해당하면 후보에서 제외한다.

- 필수 참석자의 `busy`와 겹치는 경우
- 활성화된 점심 제외 시간과 겹치는 경우
- 설정된 하루 시간 범위 밖인 경우

### 감점 규칙

다음 조건은 후보에서 제외하지 않고 감점한다.

- 선택 참석자의 `busy`와 겹침
- 참석자의 `avoid`와 겹침
- 필수 참석자가 아직 응답하지 않음(불확실성 감점)

미응답자가 있는 경우에는 후보를 제외하지 않고, 잠정 결과 문구와 조회 결과에 `미응답자 있음` 상태를 표시한다.

### 가점 규칙

다음 조건은 가점한다.

- 참석자의 `preferred`와 겹침
- 필수 참석자가 모두 가능함
- 선택 참석자도 많이 참석 가능함
- 비선호 충돌이 적음

> 현재 참석자 응답 폼은 불가 중심 입력으로 `busy` 블록만 생성한다. `avoid`/`preferred` 채점·가점 경로는 엔진과 타입에 남아 있으나 기존 데이터 호환용이며, 신규 응답에서는 이 두 상태가 더 이상 만들어지지 않는다.

### 결과 해석 제공 (확정 없음)

- modu는 회의 시간을 확정하지 않는다. 열람 조건이 충족되면 전체 응답을 해석해 캘린더와 판단 근거만 보여준다.
- 미응답자가 있으면 잠정 결과로 표시한다.
- 필수참석자가 모두 가능한 후보가 없으면 기간 조정을 안내한다.
- 비슷한 후보는 내부 모델에서 같은 그룹으로 묶고, 화면에서는 캘린더의 날짜별 상대 추천도 신호와 날짜 전체 요약을 우선 보여준다.
- 최종 회의 시간은 참여자들이 제품 밖(Slack·카톡·구두 등)에서 정한다.
- legacy 확정 회의(기존 `confirmed_slot_id` 보유)에서는 응답을 잠근다.

### 결과 해석 설명

결과 해석에는 숫자 점수만 보여주지 않는다. 반드시 사람이 이해할 수 있는 한국어 이유를 생성한다.

예시:

- `필수 참석자 4명이 모두 가능하고, 불가능 시간 충돌이 없습니다.`
- `선택 참석자 1명이 참석하기 어렵지만, 필수 참석자는 모두 가능합니다.`
- `전원 참석 가능하지만 비선호 조건이 있어 우선순위를 낮췄습니다.`
- `아직 2명이 응답하지 않았지만, 현재 응답 기준으로는 가장 충돌이 적은 시간입니다.`

## 8. 권한 및 보안 정책

이번 버전은 로그인 없는 링크 기반 알파다.

권한 원칙:

- 참석자 링크를 가진 사람은 응답 화면에 접근할 수 있다.
- 별도 관리자 화면이나 관리자 토큰은 두지 않는다.
- 일정 생성자는 참여자 중 한 명이며, 다른 참여자보다 더 높은 관리 권한을 갖지 않는다.
- 결과 캘린더와 날짜·시간 조회는 참석자 화면에서 제공한다.
- 참석자 수정은 같은 브라우저에 저장된 `participantToken`이 있을 때만 허용한다.
- Supabase secret/service role key는 서버에서만 사용한다.
- 브라우저에는 민감한 key를 노출하지 않는다.

Supabase 정책:

- 모든 public 테이블에 RLS를 활성화한다.
- 브라우저에서 직접 테이블을 읽고 쓰지 않는다.
- `anon`, `authenticated`의 직접 테이블 접근은 제한한다.
- 서버 액션 또는 Route Handler가 token 검증 후 DB 작업을 수행한다.

## 9. 백엔드 테스트 시나리오

후보 계산 알고리즘 단위 테스트:

- 점심 제외 시간이 활성화된 회의에서는 점심 시간과 겹치는 후보가 제외된다.
- 필수 참석자의 `busy`와 겹치는 후보는 제외된다.
- 선택 참석자의 `busy`와 겹치는 후보는 제외되지 않고 감점된다.
- `avoid`는 감점된다.
- `preferred`는 가점된다.
- `loadCalendarSnapshot`은 토큰 검증 후 캘린더 집계용 데이터만 반환하고 메모 원문은 반환하지 않는다.
- 미응답자가 있으면 잠정 결과 상태가 표시된다.

서버 로직 테스트:

- 회의 생성 시 참석자별 `participantToken`이 생성된다.
- 참석자 첫 제출이 저장된다.
- 같은 `participantToken`으로 기존 응답을 수정할 수 있다.
- 잘못된 `participantToken`으로 수정할 수 없다.
- 응답 제출 후에도 `confirmed_slots`가 생성되지 않고 `confirmed_slot_id`가 업데이트되지 않는다.
- 전원 응답 또는 열람 조건 충족 시 결과 해석(컨텍스트·그룹·신호)이 올바르게 만들어진다.
- 미응답자가 있으면 잠정 결과로 표시된다.
- 응답 이후 참석 유형을 임의로 변경할 수 없다.
- legacy 확정 회의에서는 응답을 수정할 수 없다.
- legacy 확정 회의만 `.ics` 파일을 다운로드할 수 있다.

## 10. 구현 완료 후 README 정리 항목

구현 완료 후 루트 `README.md`에 다음 내용을 정리한다.

- 실행 방법
- 필요한 환경변수
- 주요 화면 경로
- Supabase 테이블 생성 SQL
- 후보 계산 알고리즘 동작 방식
- 현재 구현된 기능
- 아직 제외한 기능
- 다음 개선 우선순위

## 11. 개발자 오리엔테이션 (코드 맵 / 빠른 시작)

> 새 세션에서 백엔드 코드를 빠르게 파악하기 위한 지도. 위 1~10장이 "무엇을/왜"라면 이 장은 "코드 어디에 무엇이 있는가"다. (프론트는 `frontend.md` §9)

### 11.1 데이터 흐름

```txt
[클라이언트 컴포넌트]  — URL의 토큰만 신뢰(세션 없음)
      ▼
[app/actions/meetings.ts]  ('use server') — 토큰 검증 → 도메인 검증 → 변이
      ├─▶ lib/scheduler/recommendSlots()   순수 후보 계산 엔진(DB·UI 무관, 테스트됨)
      ├─▶ lib/data.ts                       읽기 어댑터 + toPublicParticipant(토큰 제거)
      ▼
[lib/supabase/server.ts: getSupabaseAdmin()]  ('server-only', service_role → RLS 우회)
      ├─▶ (운영) @supabase/supabase-js → Postgres 5개 테이블
      └─▶ (개발, env 없음) lib/supabase/localClient.ts → .modu-local-db.json
```

### 11.2 서버 액션 (`app/actions/meetings.ts`, 모두 `'use server'`)

| 함수 | 검증 | 핵심 동작 |
| --- | --- | --- |
| `createMeeting` | 입력 검증(필수·길이·일정 후보 마지막 날≥오늘+2일·응답 마감일≤마지막 날−2일) | 일정만 생성하고 공유 화면으로 이동한다. 참여자는 공용 링크에서 등록한다. **운영+env 없음** 시 `lib/demoMeeting` 데모 ID로 우회 |
| `joinMeeting` | 이름·별명으로 참여자 자동 등록 | `participant_token` 반환, 중복 이름과 최대 인원 검증 |
| `submitAvailability` | `participantId`+토큰, 미확정(legacy) | 기존 블록 교체(delete→insert), `response_status='submitted'` — **저장까지만**(투표·자동 확정 없음) |
| `loadParticipantResponse` / `loadCalendarSnapshot` | participant 토큰 | 본인 응답 / 캘린더 집계용 최소 데이터(메모 원문 제외) |

Route Handler: `app/api/meetings/[meetingId]/ics/route.ts` — 확정 슬롯 있을 때만 `.ics`(`lib/ics.ts: buildIcs`).

### 11.3 후보 계산 엔진 (`lib/scheduler/`)

진입점 `recommendSlots(input)`(`index.ts`): 슬롯 생성(`generateSlots`) → 채점/제외(`scoreSlot`) → **점수 내림차순, 동점은 시작 빠른 순** 정렬 → 상위 N개(기본 5) → `best`는 최상위 1개로 제한(나머지 동급은 `recommended`로 강등).

**점수 공식** (`scoreSlots.ts`, 상수 전부 export — 설명/테스트용):

| 항목 | 상수 | 값 |
| --- | --- | --- |
| 기준점 | `SCORE_BASE` | +100 |
| **하드 제외** | 필수 참석자(응답함)가 `busy` → `scoreSlot`이 `null` | — |
| 선택 참석자 busy | `PENALTY_OPTIONAL_BUSY` | −15 |
| 필수 미응답(불확실성) | `PENALTY_REQUIRED_PENDING` | −12 |
| `avoid` 겹침(소프트) | `PENALTY_AVOID` | −8 |
| `preferred` 겹침(1건당) | `BONUS_PREFERRED` | +6 |

- 참석자별 `dominantStatus`: `busy > avoid > preferred > available`. 미응답자는 제외 안 하고 `pending` 표시.
- 등급(내부값 → 라벨): `best`→가장 추천 / `recommended`→추천 / `conditional`→조건부 추천 / `caution`→주의 필요. 필수 일부 불확실이면 `caution`.
- 파일: `generateSlots.ts`(00:00~24:00·30분 단위), `validate.ts`(`isSlotConfirmable`/`validateSubmittedBlocks` — 스펙 미기재지만 존재), `explainRecommendation.ts`(점수 없이 사실 집계로 한국어 이유), `types.ts`.

### 11.4 데이터·영속 계층

- **`lib/data.ts`** — 읽기 어댑터 `fetchMeeting/fetchParticipants/fetchBlocks/fetchConfirmedSlot`, 행→도메인 매핑, `toPublicParticipant`(토큰·메모 제거), `toSchedulerInput`(엔진 입력 변환), `isRequiredAllAvailable`. 데모 ID는 여기서 분기.
- **`lib/supabase/server.ts`** — `getSupabaseAdmin()`(키: `SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY`), `hasSupabaseConfig()`(데모 진입 게이트). `server-only`.
- **`lib/supabase/localClient.ts`** — supabase-js thenable 체이닝 흉내 + `runExclusive` 직렬화. **unique/check/FK는 강제 안 함**(로컬은 되는데 운영은 실패 가능).
- **`lib/tokens.ts`** — `generateToken(bytes=24)` = `randomBytes(24).toString('base64url')`(192비트 CSPRNG, 평문 저장).
- **`lib/demoMeeting.ts`** — 회의 페이로드를 `demo_` + base64url(JSON) meetingId에 인코딩(무서명). `isDemoMeetingId`, `createDemoMeetingId`, `getDemoMeeting/Participants`, 고정 참석자 토큰 `demo-token-N`.

### 11.5 함정 / 주의

- **비원자성**: `submitAvailability`(delete→insert)·`createMeeting`이 트랜잭션 아님 → 부분 실패·경쟁 조건 가능.
- **권한은 평문 토큰 `===` 비교**(상수시간 아님). RLS는 service_role만 grant라 보안이 앱 내부 토큰 비교에 전적으로 의존.
- **데모 소비 경로는 env 게이트 안 됨**: 생성은 `production && !hasSupabaseConfig()`로 막지만, 읽기/액션 단락은 `isDemoMeetingId`만으로 발동(운영에서도 `demo_` ID 위조 가능). 데모 토큰은 추측 가능·페이로드 무서명.
- **`expires_at`은 선언만** 있고 삭제 잡 없음. 점심 비활성화는 `lunch_start='00:00'/lunch_end='00:01'` 센티넬(서버가 점심 겹침 블록 거부, DDL 기본값 `12:00/13:00`과 다름 — 코드가 insert 시 센티넬 명시).
- **`localClient`(`lib/supabase/localClient.ts`)는 스키마리스가 아니다**: `withDefaults`가 테이블별 컬럼을 화이트리스트로 재구성하므로, `meetings` 등에 새 컬럼(예: `response_deadline`)을 추가하면 거기에도 넣어야 insert 시 보존된다(누락하면 조용히 버려짐). 실제 Supabase는 위 DDL `alter table … add column` 마이그레이션을 적용해야 컬럼이 생긴다.
- 신규 코드(`demoMeeting.ts` 등)·서버 액션은 **테스트 0%**(테스트는 `lib/scheduler`·`lib/grid`만).
