# modu 백엔드 구현 문서

## 1. 백엔드 목표

modu의 백엔드는 로그인 없는 링크 기반 알파 서비스에 맞춰, 토큰 기반 접근 제어와 설명 가능한 추천 계산을 제공한다.

핵심 목표:

- 회의, 참석자, 응답, 확정 정보를 안정적으로 저장한다.
- 참석자 링크와 참석자별 수정 토큰을 생성한다.
- 참석자는 같은 브라우저에서만 본인 응답을 수정할 수 있다.
- 회의 생성자는 참석자 중 한 명일 뿐이며, 별도 관리자 권한을 갖지 않는다.
- **투표는 없다.** 모든 참석자가 응답하면 modu가 전체 응답을 해석해, 확정 조건(필수참석자 불가 0명 + 미응답 0명)을 만족하는 최상위 후보를 자동으로 회의 시간으로 확정한다. 조건을 만족하는 후보가 없으면 확정하지 않는다(화면이 기간 조정을 안내).
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
| `workday_start` | 내부 계산용 근무 시작 시간, 기본 `09:00` |
| `workday_end` | 내부 계산용 근무 종료 시간, 기본 `18:00` |
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

투표 개념 제거(자동 확정으로 대체)로 **앱은 이 테이블을 더 이상 읽거나 쓰지 않는다.**
기존 배포 DB 호환과 롤백 가능성을 위해 테이블 자체는 남겨 두었고, 안정화 후 drop 마이그레이션을 검토한다.

| 컬럼 | 설명 |
| --- | --- |
| `id` | ID |
| `meeting_id` | 회의 ID |
| `participant_id` | 참석자 ID |
| `start_at` | 후보 시작 시각 |
| `end_at` | 후보 종료 시각 |
| `created_at` | 생성일 |

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
  - 회의명, 안건, 장소, 회의 마감 날짜, 응답 마감일, 회의 길이, 참석자를 생성한다.
  - 모든 항목이 필수다. 회의명·안건·장소가 비어 있으면 각각 에러를 반환한다.
  - 회의명은 공백 포함 최대 20글자, 안건은 공백 포함 최대 30글자, 장소는 공백 포함 최대 20글자까지 허용한다.
  - 참석자는 최소 2명 이상, 최대 8명까지 허용한다.
  - 회의 길이는 `durationHours`(시간)와 `durationMinutePart`(분) 입력값을 합산해 `duration_minutes`로 저장한다. 분은 0~59 정수여야 한다.
  - 회의 마감 날짜(`deadlineDate`)는 `date_end`로 저장하고, `date_start`는 생성 시점의 오늘(KST) 날짜로 채운다. 마감 날짜가 **오늘부터 이틀 뒤(`오늘+2일`) 이전이면** 에러를 반환한다(응답 마감일이 회의 마감 2일 전까지여야 하므로 여유 확보).
  - 응답 마감일(`responseDeadlineDate` + `responseDeadlineTime`, 분 없음 → 항상 `:00`)을 KST ISO로 합쳐 `response_deadline`에 저장한다. 오늘 이전이거나 **회의 마감 날짜 2일 전(`date_end −2일`)보다 늦으면** 에러를 반환한다(클라이언트가 미리 토스트로 자동 보정).
  - 회의 생성자에게 근무 시작/종료 시간과 점심 시간은 받지 않고 서버 기본값을 저장한다.
  - 참석자 기본 `attendance_type`은 클라이언트에서 `required`로 전달되며(필수참석), 서버는 `required`가 아니면 `optional`로 정규화한다.
  - `meetingId`와 참석자별 `participantToken`을 생성한다.
  - 회의 생성자도 참석자 명단에 포함된 한 명으로 취급한다.
  - 생성 후 공유 화면으로 이동한다.
  - 배포 환경에서 Supabase 환경변수가 없으면 실제 DB 저장 대신 데모 회의 ID를 생성해 공유 화면으로 이동한다.

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
  - 저장에 성공하면 `autoConfirmMeetingIfReady`를 호출한다.

- `loadCalendarSnapshot`
  - 참석자 `participantToken`을 검증한다.
  - 응답 제출 후 참석자용 회의 캘린더에 필요한 참석자 목록과 가능 여부 블록을 반환한다.
  - 참석자별 상세 메모와 블록 note 원문은 반환하지 않는다.
  - 반환 데이터는 가능/선호/불가능/미응답 집계를 만들기 위한 최소 정보로 제한한다.

- `autoConfirmMeetingIfReady` (내부 함수 — 투표를 대체하는 자동 확정)
  - 모든 참석자가 `submitted`인지 확인한다. 미응답자가 있으면 확정하지 않는다.
  - `toSchedulerInput → evaluateAllSlots → buildContextualScheduleResult`로 전체 응답을 해석한다.
  - `pickAutoConfirmSlot`이 확정 조건(필수참석자 불가 0명 + 미응답 0명)을 만족하는 정렬상 최상위 후보를 고른다. 비슷한 후보가 여러 개여도 사람이 고르지 않고 일관된 규칙(필수 불가 적음 → 가능 인원 많음 → 선택 불가 적음 → 이른 시간)을 따른다.
  - 조건을 만족하는 후보가 없으면 확정하지 않고 종료한다(화면이 기간 조정 안내를 담당).
  - 확정 직전 `isSlotConfirmable`로 서버 검증을 한 번 더 통과해야 한다.
  - `confirmed_slots`에 저장하고 `meetings.confirmed_slot_id`를 업데이트한다. 경합 방지를 위해 확정 직전 최신 상태를 재확인한다.

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
- 필수 참석자가 아직 응답하지 않음(불확실성 감점)

미응답자가 있는 경우에는 후보를 제외하지 않고, 추천 카드에 `미응답자 있음` 상태를 표시한다.

### 가점 규칙

다음 조건은 가점한다.

- 참석자의 `preferred`와 겹침
- 필수 참석자가 모두 가능함
- 선택 참석자도 많이 참석 가능함
- 비선호 충돌이 적음

> 현재 참석자 응답 폼은 불가 중심 입력으로 `busy` 블록만 생성한다. `avoid`/`preferred` 채점·가점 경로는 엔진과 타입에 남아 있으나 기존 데이터 호환용이며, 신규 응답에서는 이 두 상태가 더 이상 만들어지지 않는다.

### 자동 확정

- 모든 참석자가 `submitted` 상태가 되기 전에는 확정하지 않는다(화면은 잠정 결과만 보여준다).
- 전원 응답 시 modu가 전체 응답을 해석해, 확정 조건(필수참석자 불가 0명 + 미응답 0명)을 만족하는 정렬상 최상위 후보를 회의 시간으로 확정한다.
- 조건을 만족하는 후보가 없으면 확정하지 않고, 화면이 기간 조정을 안내한다.
- 비슷한 후보가 여러 개여도 사람이 고르지 않고, 일관된 규칙(필수 불가 적음 → 가능 인원 많음 → 선택 불가 적음 → 이른 시간)으로 하나를 정한다.
- 확정된 회의에서는 응답을 잠근다.

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
- 별도 관리자 화면이나 관리자 토큰은 두지 않는다.
- 회의 생성자는 참석자 중 한 명이며, 다른 참석자보다 더 높은 관리 권한을 갖지 않는다.
- 추천 결과 확인과 전체 캘린더는 참석자 화면에서 제공한다.
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
- `loadCalendarSnapshot`은 토큰 검증 후 캘린더 집계용 데이터만 반환하고 메모 원문은 반환하지 않는다.
- 미응답자가 있으면 추천 카드에 상태가 표시된다.

서버 로직 테스트:

- 회의 생성 시 참석자별 `participantToken`이 생성된다.
- 참석자 첫 제출이 저장된다.
- 같은 `participantToken`으로 기존 응답을 수정할 수 있다.
- 잘못된 `participantToken`으로 수정할 수 없다.
- 모든 참석자가 응답하기 전에는 확정하지 않는다.
- 전원 응답 시 확정 조건(필수 불가 0명 + 미응답 0명)을 만족하는 최상위 후보가 자동 확정된다.
- 필수참석자가 모두 참석할 수 있는 후보가 없으면 확정하지 않는다.
- 응답 이후 참석 유형을 임의로 변경할 수 없다.
- 비슷한 후보가 여러 개면 일관된 규칙(이른 시간 우선)으로 하나가 확정된다.
- 확정된 회의에서는 응답을 수정할 수 없다.
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

## 11. 개발자 오리엔테이션 (코드 맵 / 빠른 시작)

> 새 세션에서 백엔드 코드를 빠르게 파악하기 위한 지도. 위 1~10장이 "무엇을/왜"라면 이 장은 "코드 어디에 무엇이 있는가"다. (프론트는 `frontend.md` §9)

### 11.1 데이터 흐름

```txt
[클라이언트 컴포넌트]  — URL의 토큰만 신뢰(세션 없음)
      ▼
[app/actions/meetings.ts]  ('use server') — 토큰 검증 → 도메인 검증 → 변이
      ├─▶ lib/scheduler/recommendSlots()   순수 추천 엔진(DB·UI 무관, 테스트됨)
      ├─▶ lib/data.ts                       읽기 어댑터 + toPublicParticipant(토큰 제거)
      ▼
[lib/supabase/server.ts: getSupabaseAdmin()]  ('server-only', service_role → RLS 우회)
      ├─▶ (운영) @supabase/supabase-js → Postgres 5개 테이블
      └─▶ (개발, env 없음) lib/supabase/localClient.ts → .modu-local-db.json
```

### 11.2 서버 액션 (`app/actions/meetings.ts`, 모두 `'use server'`)

| 함수 | 검증 | 핵심 동작 |
| --- | --- | --- |
| `createMeeting` | 입력 검증(필수·길이·인원 2~8·회의 마감일≥오늘+2일·응답 마감일≤마감일−2일) | 회의(`response_deadline` 포함)+참석자 insert, 참석자별 `participant_token` 발급, 공유 화면 redirect. **운영+env 없음** 시 `lib/demoMeeting` 데모 ID로 우회 |
| `verifyParticipantIdentity` | 이름+직무 명단 대조 | `participant_token` 반환(기존 제출자는 토큰 일치 시 수정 허용) |
| `submitAvailability` | `participantId`+토큰, 미확정 | 기존 블록 교체(delete→insert), `response_status='submitted'`, 성공 시 **`autoConfirmMeetingIfReady` 호출** |
| `loadParticipantResponse` / `loadCalendarSnapshot` | participant 토큰 | 본인 응답 / 캘린더 집계용 최소 데이터(메모 원문 제외) |
| `autoConfirmMeetingIfReady`(내부) | 전원 응답 + 확정 조건(필수 불가 0·미응답 0) + `isSlotConfirmable` | `evaluateAllSlots → buildContextualScheduleResult → pickAutoConfirmSlot`로 최상위 후보를 골라 `confirmed_slots` insert + `confirmed_slot_id` update. 조건 미충족 시 아무것도 하지 않음 |

Route Handler: `app/api/meetings/[meetingId]/ics/route.ts` — 확정 슬롯 있을 때만 `.ics`(`lib/ics.ts: buildIcs`).

### 11.3 추천 엔진 (`lib/scheduler/`)

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
- 파일: `generateSlots.ts`(09:00~18:00·30분·점심 겹침 제외), `validate.ts`(`isSlotConfirmable`/`validateSubmittedBlocks` — 스펙 미기재지만 존재), `explainRecommendation.ts`(점수 없이 사실 집계로 한국어 이유), `types.ts`.

### 11.4 데이터·영속 계층

- **`lib/data.ts`** — 읽기 어댑터 `fetchMeeting/fetchParticipants/fetchBlocks/fetchConfirmedSlot`, 행→도메인 매핑, `toPublicParticipant`(토큰·메모 제거), `toSchedulerInput`(엔진 입력 변환), `isRequiredAllAvailable`. 데모 ID는 여기서 분기.
- **`lib/supabase/server.ts`** — `getSupabaseAdmin()`(키: `SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY`), `hasSupabaseConfig()`(데모 진입 게이트). `server-only`.
- **`lib/supabase/localClient.ts`** — supabase-js thenable 체이닝 흉내 + `runExclusive` 직렬화. **unique/check/FK는 강제 안 함**(로컬은 되는데 운영은 실패 가능).
- **`lib/tokens.ts`** — `generateToken(bytes=24)` = `randomBytes(24).toString('base64url')`(192비트 CSPRNG, 평문 저장).
- **`lib/demoMeeting.ts`** — 회의 페이로드를 `demo_` + base64url(JSON) meetingId에 인코딩(무서명). `isDemoMeetingId`, `createDemoMeetingId`, `getDemoMeeting/Participants`, 고정 참석자 토큰 `demo-token-N`.

### 11.5 함정 / 주의

- **비원자성**: `autoConfirmMeetingIfReady`(confirmed_slots insert→meetings update)·`submitAvailability`(delete→insert)·`createMeeting`이 트랜잭션 아님 → 부분 실패·경쟁 조건 가능.
- **권한은 평문 토큰 `===` 비교**(상수시간 아님). RLS는 service_role만 grant라 보안이 앱 내부 토큰 비교에 전적으로 의존.
- **데모 소비 경로는 env 게이트 안 됨**: 생성은 `production && !hasSupabaseConfig()`로 막지만, 읽기/액션 단락은 `isDemoMeetingId`만으로 발동(운영에서도 `demo_` ID 위조 가능). 데모 토큰은 추측 가능·페이로드 무서명.
- **`expires_at`은 선언만** 있고 삭제 잡 없음. 점심 비활성화는 `lunch_start='00:00'/lunch_end='00:01'` 센티넬(서버가 점심 겹침 블록 거부, DDL 기본값 `12:00/13:00`과 다름 — 코드가 insert 시 센티넬 명시).
- **`localClient`(`lib/supabase/localClient.ts`)는 스키마리스가 아니다**: `withDefaults`가 테이블별 컬럼을 화이트리스트로 재구성하므로, `meetings` 등에 새 컬럼(예: `response_deadline`)을 추가하면 거기에도 넣어야 insert 시 보존된다(누락하면 조용히 버려짐). 실제 Supabase는 위 DDL `alter table … add column` 마이그레이션을 적용해야 컬럼이 생긴다.
- 신규 코드(`demoMeeting.ts` 등)·서버 액션은 **테스트 0%**(테스트는 `lib/scheduler`·`lib/grid`만).
