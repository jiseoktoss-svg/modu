# modu

> 모두의 시간, 모두의 회의

**modu**는 단순 일정 투표가 아니라, 필수/선택 참석자와 개인별 선호 날짜·불가능 날짜, 날짜별 시간대 조정을 함께 고려해 **왜 이 시간이 좋은지 설명하는 회의 시간 의사결정 도구**입니다. 로그인 없이 링크로 응답을 받고, 참석자가 추천 후보에 투표한 뒤 다수결 1위 시간으로 회의를 확정합니다.

이 저장소는 실제로 동료에게 링크를 보내 사용할 수 있는 **알파 버전**입니다.

---

## 실행 방법

```bash
# 1) 의존성 설치
npm install

# 2) Supabase로 실제 저장하려면 환경변수 설정 (.env.example 참고)
cp .env.example .env.local
#   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY 채우기
#
#   로컬 개발 모드에서는 두 값이 비어 있어도
#   .modu-local-db.json 파일 저장소로 회의 생성 플로우를 테스트할 수 있음

# 3) Supabase를 사용할 경우 테이블 생성 (아래 "Supabase 설정" 참고)

# 4) 개발 서버
npm run dev        # http://localhost:3000

# 그 외
npm run typecheck  # 타입 체크
npm run test       # 추천 알고리즘 단위 테스트
npm run build      # 프로덕션 빌드
```

## 필요한 환경변수

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 배포 시 필수 | Supabase 프로젝트 URL. 개발 모드에서는 비워두면 파일 저장소를 사용 |
| `SUPABASE_SECRET_KEY` | 배포 시 필수 | 서버 전용 secret key. **브라우저에 노출 금지** |
| `SUPABASE_SERVICE_ROLE_KEY` | 선택 | `SUPABASE_SECRET_KEY` 가 없을 때의 fallback |
| `NEXT_PUBLIC_APP_URL` | 선택 | 안내용. 공유 링크는 브라우저 origin 으로 생성됨 |

> Supabase 접근은 **서버에서만** 이뤄지며, secret/service-role key 는 클라이언트 번들에 포함되지 않습니다. 개발 모드에서 Supabase 값이 없으면 `.modu-local-db.json` 파일 저장소로 동작합니다.

## 주요 화면 경로

| 경로 | 역할 |
| --- | --- |
| `/` | 랜딩 |
| `/meetings/new` | 회의 만들기 |
| `/meetings/[meetingId]/share` | 생성 후 공유 화면 (참석자 링크) |
| `/meetings/[meetingId]/share/[adminToken]` | 기존 링크 호환용 공유 화면 |
| `/m/[meetingId]` | 참석자 응답 (로그인 없음) |
| `/admin/[meetingId]/[adminToken]` | 주최자 결과·전체 캘린더·후보 투표·다수결 확정 |
| `/meetings/[meetingId]/confirmed` | 확정 화면 (공유 문구 · `.ics`) |
| `/api/meetings/[meetingId]/ics` | `.ics` 다운로드 (확정 시에만) |

## Supabase 설정

`supabase/schema.sql` 전체를 Supabase SQL Editor 에 붙여 실행하세요. 다음을 포함합니다.

- enum 타입 (`attendance_type`, `response_status`, `availability_status`)
- 테이블: `meetings`, `participants`, `availability_blocks`, `meeting_votes`, `confirmed_slots`
- 제약(날짜·시간 순서), 인덱스
- RLS 활성화 + `anon`/`authenticated` 직접 접근 차단, `service_role` 만 허용

## 추천 알고리즘 동작 방식

추천 로직은 UI 와 분리되어 `lib/scheduler/` 에 있고 단위 테스트로 검증됩니다.

1. **후보 생성** (`generateSlots`): 오늘부터 회의 마감 날짜까지, 09:00~18:00 고정 근무 시간 안에서 30분 단위 후보를 만든다.
2. **제외**: 필수 참석자의 불가능 시간대(`busy`)와 겹치거나 근무시간을 벗어나면 후보에서 제거한다.
3. **감점**: 선택 참석자 `busy`, 누군가의 `avoid`, 필수 참석자 미응답(불확실성).
4. **가점**: `preferred` 와 겹침.
5. **등급**: `가장 추천 / 추천 / 조건부 추천 / 주의 필요`. '가장 추천'은 최상위 1개에만.
6. **설명** (`explainRecommendation`): 점수 대신 사람이 읽는 한국어 이유를 생성.
7. **투표**: 모든 참석자가 응답하면 후보 시간대 투표가 열리고, 모든 투표가 모였을 때 주최자가 최다 득표 후보를 확정. 동률이면 주최자가 1위 후보 중 하나를 선택.

미응답자는 후보를 제외하지 않고 카드에 `미응답 N명`으로 표시합니다.

> 시간은 모두 **Asia/Seoul(KST, +09:00)** 벽시계 기준으로 계산하고, DB 에는 절대 시각으로 저장합니다.

## 현재 구현된 기능

- 회의 생성: 한 항목씩 입력하면 상단 안내 문장이 완성되는 "문장 빌더" 흐름(회의명 → 안건 → 장소 → 회의 마감 날짜 → 예상 회의 진행 시간(시간/분) → 참석자 순). 모든 항목 필수이며, 상단 문장의 값을 클릭하면 해당 항목으로 돌아가 수정. 회의명은 최대 20글자, 안건은 최대 30글자, 장소는 최대 20글자까지 허용하고 초과 시 입력 라벨이 아이콘 포함 경고 문구로 바뀐다. 회의 마감 날짜는 요일을 표시하는 중앙 모달형 커스텀 캘린더(`components/ui/DatePicker.tsx`, KST 안전, 최소 오늘)로 선택. 참석자는 가상 직원 50명 검색·클릭으로 추가하고 필수참석/선택참석 두 구역에서 드래그 앤 드롭으로 분류(데스크톱 마퀴 선택, 모바일 터치 드래그 지원)하며 2~8명까지 선택 가능하다. 생성 시 참석자별 토큰 발급, 참석자 링크 생성
- 회의 생성 직후 `회의가 만들어졌어요` 화면(`MeetingCreatedPanel`): 완료 애니메이션 + 회의 내용·참석자 명단 + 참석자 전달 링크 복사 + 하단 `수정/시간 입력` CTA
- 참석자 응답은 문장 빌더 흐름: 링크 진입 시 회의 안내(intro) → `시간 정하러 가기` → 본인 확인(이름/직무 명단 검증, 오류는 토스트) → **가능 시간 5단계**(① 공통 피하고 싶은 시간대 `avoid` ② 공통 선호 시간대 ③ 불가능 날짜 `busy` ④ 선호 날짜 ⑤ 특정 날짜+시간 `busy`, 시간대·날짜 다중 입력, 월 이동(`<`/`>`) 달력·토일 비활성) → 제출. 근무시간 밖·"피하고 싶은" 시간과 겹치는 선호는 입력 차단, 점심시간과 겹치는 블록은 제외. 같은 브라우저 수정(localStorage 토큰)
- 응답 제출 후 시간축 캘린더에서 전체 가능/선호/불가능/미응답 집계 확인
- 캘린더 칸 선택 시 참석자별 상태 요약 표시, 상세 메모 원문 비노출
- 변경한 블록만 저장(`available` 은 미저장)
- 전체 캘린더에서 참석자별 선호/불가능 시간 집계 확인
- 추천 후보 + 한국어 이유 + 참석자별 영향 + 필수/선택 즉시 재계산
- 전원 응답 후 후보 시간대 투표, 전원 투표 후 최다 득표 후보 확정
- 확정 후 공유 문구 + `.ics` 다운로드
- 토큰 기반 권한, 서버 전용 Supabase 접근, RLS
- 개발 환경 Supabase 미설정 시 `.modu-local-db.json` 파일 저장소 fallback

## 개인정보 보호

- 상세 일정명은 입력·저장하지 않습니다.
- 가능 여부와 선호 상태만 저장합니다.
- 메모는 선택 입력이며 추천 요약에 원문을 직접 노출하지 않습니다.
- 회의 데이터는 `expires_at`(기본 생성 후 30일) 이후 삭제될 수 있음을 안내합니다.

## 아직 제외한 기능 (알파 범위 밖)

Google Calendar 실시간 연동, 로그인/회원가입, 이메일 자동 발송, Slack 연동, 결제, 조직 관리, 반복 회의, 자동 만료 삭제 작업, 참석자별 상세 일정명.

## 다음 개선 우선순위

1. 만료(`expires_at`) 데이터 정리 작업(크론/엣지 함수).
2. 응답 메모를 블록별로 세분화 (현재는 참석자당 1개의 메모를 `participants.memo` 에 저장).
3. 추천 후보 화면에서 날짜별 최적 시간대 설명 강화.
4. 추천 점수 가중치 설정 UI / 주말·공휴일 제외 옵션.
5. 확정 화면 접근 제어 옵션(현재는 meetingId 를 아는 사람에게 공개).

## 기술 스택

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase(Postgres) · Vitest

UI는 Tailwind CSS 기반의 프로젝트 내부 컴포넌트를 사용합니다. 버튼, 입력창, 배지, 카드, 날짜 선택기 등은 `components/ui/` 아래에 있는 자체 컴포넌트로 구성되어 있습니다.

본문 텍스트는 Pretendard(`globals.css` 에서 CDN `@import`, Tailwind `fontFamily.sans` 에도 반영)로 렌더링합니다. 이모지는 `TossFace` 폰트로 렌더링하며(`globals.css` 의 `@font-face` `unicode-range` 로 이모지 코드포인트에만 적용), `public/fonts/TossFaceFontWeb.otf`(COLR/CPAL, 전 브라우저 컬러)를 우선 사용하고 `TossFaceFontMac.ttf` 로 폴백합니다. UI 아이콘은 lucide-react 대신 유니코드 이모지를 `components/ui/Emoji.tsx`(TossFace)로 렌더링합니다.

## 디렉터리 구조

```txt
app/                # 라우트 (서버 컴포넌트 기본) + Server Actions + ICS Route Handler
components/
  ui/               # Button, Card, Badge, Input, ...
  meeting/          # 회의 생성·공유·확정 관련
  scheduler/        # 시간표 입력 · 추천 카드 등
lib/
  scheduler/        # 추천 알고리즘 (UI 비의존, 테스트 대상)
  data.ts           # Supabase 조회 + 도메인 매핑
  time.ts           # KST 시간 유틸
  ...
supabase/schema.sql # 테이블 생성 SQL
test/               # 추천 알고리즘 단위 테스트
```
