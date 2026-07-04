"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DebugPageTag } from "@/components/dev/DebugPageTag";
import { Emoji } from "@/components/ui/Emoji";
import {
  loadCalendarSnapshot,
  loadParticipantResponse,
  submitAvailability,
  verifyParticipantIdentity,
} from "@/app/actions/meetings";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TDSButton } from "@/components/ui/TDSButton";
import { MeetingSummarySentence } from "@/components/meeting/MeetingSummarySentence";
import { CharFillSentence } from "@/components/ui/CharFillSentence";
import { charFillTiming, type CharFillSegment } from "@/lib/charFill";
import { CalendarModal } from "@/components/scheduler/CalendarModal";
import { CalendarChevron, CalendarGrid } from "@/components/ui/CalendarGrid";
import {
  CALENDAR_WEEKDAYS,
  formatKoreanDateLabel,
  getCalendarMonthsWithDates,
  parseDateStr,
} from "@/components/ui/calendarUtils";
import {
  clearResponseDraft,
  readResponseDraft,
  writeResponseDraft,
  type ResponseDraftStep,
} from "@/components/scheduler/responseDraft";
import { MobileHeaderTitle } from "@/components/layout/MobileHeaderTitle";
import { MobileStickyAction } from "@/components/layout/MobileStickyAction";
import { cn } from "@/lib/cn";
import { hasBatchim } from "@/lib/korean";
import { useScrollLock } from "@/lib/useScrollLock";
import { cellKey, cellsToBlocks, GRID_STEP_MINUTES } from "@/lib/grid";
import {
  addDaysToDateStr,
  formatKoreanDateTimeRange,
  formatKoreanTime,
  formatKoreanTimeRange,
  kstWallToIso,
  parseHm,
} from "@/lib/time";
import { MOCK_EMPLOYEES } from "@/data/mockEmployees";
import type { PublicParticipant } from "@/lib/data";
import type {
  CalendarSnapshotBlock,
  CalendarSnapshotParticipant,
} from "@/lib/actionTypes";
import type { AttendanceType, AvailabilityStatus, CellStatus } from "@/lib/types";
import { recommendSlots, GRADE_LABELS, type SlotCandidate } from "@/lib/scheduler";
import {
  DEMO_PEOPLE,
  DEMO_CASES,
  buildCaseCandidates,
  buildCaseSnapshot,
} from "@/data/demoCases";
import { AvailabilitySearchBox } from "@/components/scheduler/AvailabilitySearchBox";
import { AvailabilitySearchResultPanel } from "@/components/scheduler/AvailabilitySearchResultPanel";
import { CandidateFilterChips } from "@/components/scheduler/CandidateFilterChips";
import { DateAvailabilitySummaryPanel } from "@/components/scheduler/DateAvailabilitySummaryPanel";
import type { AvailabilityLookupResult } from "@/lib/scheduler/availabilityLookup";
import {
  CANDIDATE_FILTER_OPTIONS,
  rankGroupKindMatchesFilter,
  type CandidateFilter,
} from "@/lib/scheduler/candidateFilters";
import { summarizeDateAvailability } from "@/lib/scheduler/dateAvailabilitySummary";
import { adaptDemoCaseToEvaluatedSlots } from "@/data/demoCaseAdapter";
import {
  buildContextualScheduleResult,
  type CalendarMark,
  type CalendarTone,
} from "@/lib/scheduler/contextualResult";

interface Props {
  meetingId: string;
  meetingTitle: string;
  agenda: string;
  location: string;
  deadlineDate: string;
  responseDeadline?: string | null;
  durationMinutes: number;
  dates: string[];
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  initialParticipants: PublicParticipant[];
}

type Step = "loading" | ResponseDraftStep;
type DateSummaryStatus = "available" | "preferred" | "busy" | "mixed";
type CalendarStatus = "available" | "preferred" | "avoid" | "busy" | "pending";

// 입력 확인(review) 문장은 글자 잉크 채움(공용 CharFillSentence)으로 등장한다.
const REVIEW_CTA_DURATION_MS = 1000;

// 입력 확인 값 조각: 글자 span 들을 빨강 EditValue 로 감싼다(shine 은 채움 완료 후 점등).
function reviewValue(text: string, fieldLabel: string, onEdit: () => void): CharFillSegment {
  return {
    text,
    wrap: (chars, shine) => (
      <EditValue fieldLabel={fieldLabel} tone="negative" withShine={shine} onEdit={onEdit}>
        {chars}
      </EditValue>
    ),
  };
}

function storageKey(meetingId: string) {
  return `modu:p:${meetingId}`;
}

function buildRows(workdayStart: string, workdayEnd: string) {
  const rows: number[] = [];
  const start = parseHm(workdayStart);
  const end = parseHm(workdayEnd);
  for (let minute = start; minute + GRID_STEP_MINUTES <= end; minute += GRID_STEP_MINUTES) {
    rows.push(minute);
  }
  return rows;
}

function summarizeDate(
  dateIndex: number,
  rows: number[],
  cells: Record<string, CellStatus>,
) {
  let available = 0;
  let preferred = 0;
  let busy = 0;
  let avoid = 0;

  for (const minute of rows) {
    const status = cells[cellKey(dateIndex, minute)] ?? "available";
    if (status === "busy") busy += 1;
    else if (status === "preferred") preferred += 1;
    else if (status === "avoid") avoid += 1;
    else available += 1;
  }

  let status: DateSummaryStatus = "mixed";
  if (busy === rows.length) status = "busy";
  else if (preferred === rows.length) status = "preferred";
  else if (available === rows.length) status = "available";

  return { status, available, preferred, busy, avoid };
}

// 데모용 더미 응답: 6명이 선호/불가를 입력한 상태를 결정적으로 생성한다.
const DUMMY_PEOPLE = MOCK_EMPLOYEES.slice(0, 6);

function buildDummySnapshot(
  dates: string[],
  rows: number[],
): { participants: CalendarSnapshotParticipant[]; blocks: CalendarSnapshotBlock[] } {
  const participants: CalendarSnapshotParticipant[] = DUMMY_PEOPLE.map((e, i) => ({
    id: `dummy-${e.id}`,
    name: e.name,
    role: e.role,
    attendanceType: (i < 4 ? "required" : "optional") as AttendanceType,
    responseStatus: "submitted",
  }));

  if (dates.length === 0 || rows.length === 0) return { participants, blocks: [] };

  const minM = rows[0];
  const maxM = rows[rows.length - 1] + GRID_STEP_MINUTES;
  const clamp = (m: number) => Math.min(Math.max(m, minM), maxM);

  const blocks: CalendarSnapshotBlock[] = [];
  const add = (i: number, date: string, startM: number, endM: number, status: AvailabilityStatus) => {
    const s = clamp(startM);
    const e = clamp(endM);
    if (s >= e) return;
    blocks.push({
      participantId: `dummy-${DUMMY_PEOPLE[i].id}`,
      startAt: kstWallToIso(date, s),
      endAt: kstWallToIso(date, e),
      status,
    });
  };

  DUMMY_PEOPLE.forEach((_, i) => {
    // 선호: 오후 시간대 (사람마다 30분씩 어긋나게)
    const prefDate = dates[i % dates.length];
    const prefStart = 13 * 60 + 30 + (i % 3) * 30; // 13:30 / 14:00 / 14:30
    add(i, prefDate, prefStart, prefStart + 60, "preferred");

    // 불가: 오전 시간대
    const busyDate = dates[(i + 2) % dates.length];
    const busyStart = 9 * 60 + (i % 2) * 60; // 09:00 / 10:00
    add(i, busyDate, busyStart, busyStart + 90, "busy");
  });

  return { participants, blocks };
}

// 빈 값 자리표시: 회색 dot 3개 파도타기 애니메이션(생성 화면과 동일).
function DotWave() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1.5 leading-none">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-slate-400 animate-dot-wave motion-reduce:animate-none"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

// 상단 문장에서 클릭하면 해당 단계로 돌아가 수정할 수 있는 값.
// 긍정(선호)은 파란색, 부정(불가/안 되는)은 연한 빨간색으로 구분한다.
function EditValue({
  fieldLabel,
  onEdit,
  tone = "positive",
  withShine = false,
  children,
}: {
  fieldLabel: string;
  onEdit: () => void;
  tone?: "positive" | "negative";
  withShine?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${fieldLabel} 수정`}
      className={cn(
        // text-left/align-baseline: 여러 줄로 감싸질 때 button 기본 center 정렬을 막아 좌측정렬 유지([11]).
        "inline rounded text-left align-baseline font-semibold decoration-2 underline-offset-4 transition-colors hover:underline focus:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-brand-200",
        // shine 은 -webkit-text-fill-color:transparent 라 tone 색과 동시 적용 불가 → 상호배타([12]).
        // negative + shine 이면 빨간색 shine 변형(입력확인 필드값 = 클릭 가능한 키워드).
        withShine
          ? tone === "negative"
            ? "modu-value-shine-red"
            : "modu-value-shine"
          : tone === "negative"
            ? "text-red-400 decoration-red-300 hover:text-red-500"
            : "text-brand-600 decoration-brand-400 hover:text-brand-700",
      )}
    >
      {children}
    </button>
  );
}

// 칩 삭제 X 아이콘: 칩의 텍스트 색(currentColor)을 따라가 배지 색과 어울리게 한다.
function ChipRemoveIcon() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
      <path
        d="M2 2 8 8M8 2 2 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 시간대: 모든 입력은 30분 단위 분(minute) 범위로 환원한다.
type TimeRange = { start: number; end: number };

function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시` : `${h}시 ${m}분`;
}
function fmtRange(r: TimeRange): string {
  return `${fmtTime(r.start)}~${fmtTime(r.end)}`;
}
function fmtMD(ds: string): string {
  const [, m, d] = ds.split("-").map(Number);
  return `${m}/${d}`;
}
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// 30분 단위 하루 전체 시간 목록(00:00~23:30).
const TIME_PICK_STEP = 30;
const ALL_TIME_OPTIONS: number[] = (() => {
  const out: number[] = [];
  for (let min = 0; min < 24 * 60; min += TIME_PICK_STEP) out.push(min);
  return out;
})();

// "오전 09:00" / "오후 06:00" 형태(네이티브 time 입력과 동일 톤).
function formatClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${pad2(h12)}:${pad2(m)}`;
}
function minToHm(min: number): string {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

// 근무시간 외는 회색 처리하고, 선택 시 컨펌을 거쳐 허용하는 커스텀 시간 선택기.
// (네이티브 input[type=time]은 특정 시간을 회색 처리할 수 없어 직접 만든다.)
function TimeSelect({
  value,
  onChange,
  workStart,
  workEnd,
  ariaLabel,
}: {
  value: string; // HH:MM
  onChange: (hhmm: string) => void;
  workStart: number; // 분
  workEnd: number; // 분
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(null); // 근무시간 외 — 컨펌 대기
  const [sel, setSel] = useState(() => parseHm(value)); // 목록에서 고른 시간(확인 전까지 적용 안 함)
  const listRef = useRef<HTMLDivElement>(null);
  const valueMin = parseHm(value);

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPending(null);
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // 열릴 때 현재 값으로 스크롤.
  useEffect(() => {
    if (open && pending === null && listRef.current) {
      const el = listRef.current.querySelector('[data-sel="true"]');
      if (el) (el as HTMLElement).scrollIntoView({ block: "center" });
    }
  }, [open, pending]);

  const inWork = (min: number) => min >= workStart && min <= workEnd;
  // 목록에서 시간을 탭하면 선택만 하고, 하단 '확인'을 눌러야 적용된다.
  const commit = () => {
    if (!inWork(sel)) {
      setPending(sel); // 근무시간 외면 한 번 더 확인을 받는다.
      return;
    }
    onChange(minToHm(sel));
    setOpen(false);
  };
  const confirmPending = () => {
    if (pending !== null) onChange(minToHm(pending));
    setPending(null);
    setOpen(false);
  };
  const close = () => {
    setPending(null);
    setOpen(false);
  };

  const dialog = open ? (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:px-4 sm:py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-[22rem] sm:rounded-[22px] sm:border sm:border-slate-200"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">{ariaLabel}</p>
          <button
            type="button"
            onClick={close}
            aria-label={`${ariaLabel} 닫기`}
            className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <Emoji symbol="✕" size={20} />
          </button>
        </div>
        {pending !== null ? (
          <>
            <div className="flex flex-1 flex-col justify-center px-4 py-5">
              <p className="text-base font-bold text-slate-900">{formatClock(pending)}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                선택한 시간이 근무시간({formatClock(workStart)}~{formatClock(workEnd)})을 벗어났어요.
                그래도 선택할까요?
              </p>
            </div>
            <div className="shrink-0 border-t border-slate-100 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:border-t-0 sm:pb-4 sm:pt-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmPending}
                  className="flex-1 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-600"
                >
                  선택
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div ref={listRef} className="flex-1 overflow-y-auto py-1">
              {ALL_TIME_OPTIONS.map((min) => {
                const work = inWork(min);
                const isSel = min === sel;
                return (
                  <button
                    key={min}
                    type="button"
                    data-sel={isSel}
                    onClick={() => setSel(min)}
                    className={cn(
                      "flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-slate-50",
                      isSel
                        ? "font-bold text-brand-600"
                        : work
                          ? "text-slate-700"
                          : "text-slate-300",
                    )}
                  >
                    <span>{formatClock(min)}</span>
                    {!work && <span className="text-[11px] text-slate-300">근무시간 외</span>}
                    {isSel && <Emoji symbol="✓" size={12} />}
                  </button>
                );
              })}
            </div>
            <div className="shrink-0 border-t border-slate-100 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:border-t-0 sm:pb-4 sm:pt-2">
              <TDSButton size="xl" display="block" onClick={commit}>
                확인
              </TDSButton>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPending(null);
          setSel(valueMin);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 transition-colors hover:border-slate-400 focus:border-2 focus:border-brand-400 focus:outline-none focus:ring-0"
      >
        <span className={inWork(valueMin) ? "" : "text-amber-600"}>{formatClock(valueMin)}</span>
        <Emoji symbol="🕐" size={15} />
      </button>
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}

// 모바일 여부(<=639px). 모달을 모바일은 전체화면, 데스크톱은 가운데 카드로 다르게 그리기 위함.
// 초기값을 동기 계산해 모달이 열리는 순간 깜빡임(데스크톱 카드→전체화면)이 없도록 한다.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

// '?' 아이콘을 누르면 설명 툴팁을 토글로 보여준다(모바일에서도 동작하도록 hover 가 아닌 click).
function HelpTooltip({ text, label = "도움말" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const isMobile = useIsMobile();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // 모바일: 트리거가 화면 좌우 어디에 있든 뷰포트 안에 고정되도록 portal + fixed로 배치.
  const [mobilePos, setMobilePos] = useState<{ bottom: number } | null>(null);

  useEffect(() => {
    if (!open || !isMobile) return;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        // 트리거 '위쪽'으로 8px 띄워 펼친다(하단 고정 CTA 가림 방지 목적 유지).
        setMobilePos({ bottom: window.innerHeight - rect.top + 8 });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, isMobile]);

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold leading-none text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        ?
      </button>
      {open &&
        (isMobile
          ? // 모바일: 뷰포트 기준 fixed + 좌우 16px 여백(left-4 right-4)으로 절대 화면을 벗어나지 않게 한다.
            typeof document !== "undefined" &&
            createPortal(
              <span
                id={tipId}
                role="tooltip"
                style={{ bottom: mobilePos?.bottom ?? 8 }}
                className="fixed inset-x-4 z-50 break-keep rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium leading-relaxed text-white shadow-lg"
              >
                {text}
              </span>,
              document.body,
            )
          : // 데스크톱: 트리거 '왼쪽 기준'으로 오른쪽을 향해 펼쳐 화면 왼쪽 이탈 방지 + 폭 고정으로 2줄 표현.
            (
              <span
                id={tipId}
                role="tooltip"
                className="absolute bottom-full left-0 mb-2 z-40 w-[25rem] max-w-[calc(100vw-2rem)] whitespace-normal break-keep rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium leading-relaxed text-white shadow-lg"
              >
                {text}
              </span>
            ))}
    </span>
  );
}

// 회의만들기 달력 모달과 동일한 톤의 다중 선택 날짜 모달.
// 트리거 버튼을 누르면 모달이 열리고, 여러 날짜를 탭해 선택한다.
function CalendarModalField({
  title,
  placeholder,
  dates,
  selected,
  onToggle,
  tone,
  blockedDates,
}: {
  title: string;
  placeholder: string;
  dates: string[];
  selected: Set<string>;
  onToggle: (ds: string) => void;
  tone: "busy" | "pref";
  blockedDates?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const list = [...selected].sort();
  const chipTone =
    tone === "busy" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 transition-colors hover:border-slate-400 focus:border-2 focus:border-brand-400 focus:outline-none focus:ring-0"
      >
        <span className={list.length > 0 ? "truncate" : "text-slate-400"}>
          {list.length > 0 ? `${list.length}개 날짜 선택됨` : placeholder}
        </span>
        <Emoji symbol="📅" size={16} />
      </button>
      {list.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {list.map((ds) => (
            <span
              key={ds}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold",
                chipTone,
              )}
            >
              {fmtMD(ds)}
              <button
                type="button"
                onClick={() => onToggle(ds)}
                aria-label={`${fmtMD(ds)} 삭제`}
                className="ml-0.5 opacity-60 hover:opacity-100"
              >
                <ChipRemoveIcon />
              </button>
            </span>
          ))}
        </div>
      )}
      <CalendarModal
        open={open}
        title={title}
        subtitle="여러 날짜를 선택할 수 있어요"
        isMobile={isMobile}
        dates={dates}
        selected={selected}
        onToggle={onToggle}
        tone={tone}
        blockedDates={blockedDates}
        showSelectedChips
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </div>
  );
}

// 토스트: 앱 공통 패턴(상단 고정 pill + 아이콘 + 자동 사라짐).
function Toast({ open, message, icon = "⚠️" }: { open: boolean; message: string; icon?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 top-5 z-50 inline-flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-[16px] bg-white px-4 py-3 text-sm font-bold leading-snug text-slate-800 shadow-[0_8px_20px_rgba(15,23,42,0.12)] transition-all duration-200 ease-out",
        open
          ? "translate-y-0 opacity-100 blur-0"
          : "pointer-events-none -translate-y-2 opacity-0 blur-sm",
      )}
    >
      <Emoji symbol={icon} size={16} className="shrink-0" />
      <span className="break-keep">{message}</span>
    </div>
  );
}

export function ResponseForm(props: Props) {
  const {
    meetingId,
    meetingTitle,
    agenda,
    location,
    deadlineDate,
    responseDeadline,
    durationMinutes,
    dates,
    workdayStart,
    workdayEnd,
    lunchStart,
    lunchEnd,
  } = props;
  const participants = props.initialParticipants;
  const rows = useMemo(
    () => buildRows(workdayStart, workdayEnd),
    [workdayStart, workdayEnd],
  );
  const isMobile = useIsMobile();

  const [step, setStep] = useState<Step>("loading");
  const [caseId, setCaseId] = useState(1); // 데모: 후보/캘린더에 보여줄 케이스(docs/cases.md)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [identityName, setIdentityName] = useState("");
  const [identityRole, setIdentityRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // 본인확인 문장 빌더 단계: 0=이름, 1=직무.
  const [formStep, setFormStep] = useState(0);
  const [maxFormStep, setMaxFormStep] = useState(0);
  const skipFormFocus = useRef(true); // 본인확인 진입 시 자동 포커스(스크롤 점프) 방지
  const skipNextAutoFocus = useRef(false); // 모바일 '다음' 이동 시 자동 포커스(키보드 팝업·스크롤) 방지
  // 가능 시간 입력(문장 빌더, 불가 중심 2단계): 0=불가날짜, 1=특정날짜+시간.
  const [availStep, setAvailStep] = useState(0);
  const [maxAvailStep, setMaxAvailStep] = useState(0);
  const [busyDates, setBusyDates] = useState<Set<string>>(() => new Set());
  const [dateTimeBusy, setDateTimeBusy] = useState<Record<string, TimeRange[]>>({});
  const [dtDate, setDtDate] = useState<string | null>(null); // 특정날짜+시간 단계에서 시간 입력 중인 날짜
  const [dtModalOpen, setDtModalOpen] = useState(false); // 특정날짜+시간 날짜 선택 모달
  // 시간 입력 기본값: 시작=근무 시작(보통 오전 09:00), 끝=시작+1시간(오전 10:00).
  const DEFAULT_DRAFT_START = workdayStart;
  const DEFAULT_DRAFT_END = minToHm(parseHm(workdayStart) + 60);
  const [draftStart, setDraftStart] = useState(DEFAULT_DRAFT_START);
  const [draftEnd, setDraftEnd] = useState(DEFAULT_DRAFT_END);
  // 복사완료 토스트처럼 요소는 계속 렌더되고 open 클래스만 토글해 등장/사라짐을 전환한다.
  // (사라지는 동안 message 를 유지해야 텍스트가 즉시 사라지지 않고 부드럽게 페이드아웃된다.)
  const [toastMessage, setToastMessage] = useState("");
  const [toastIcon, setToastIcon] = useState("⚠️");
  const [toastOpen, setToastOpen] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const [reviewCtaReady, setReviewCtaReady] = useState(false);
  // 회의 안내(intro): 문장 채움이 끝난 뒤에야 '시간 정하러 가기' CTA 를 노출한다.
  const [introCtaReady, setIntroCtaReady] = useState(false);
  const [responseDraftReady, setResponseDraftReady] = useState(false);

  const selected = participants.find((p) => p.id === selectedId) ?? null;
  const roleOptions = Array.from(
    new Set(participants.map((p) => p.role.trim()).filter(Boolean)),
  );
  // 본인확인 빌더: 0=이름, 1=직무(마지막).
  const IDENTITY_LAST_STEP = 1;
  const formValid = (s: number) =>
    s === 0 ? identityName.trim().length > 0 : identityRole.trim().length > 0;
  const clauseVisible = (i: number) => i <= maxFormStep;

  // 가능 시간 빌더(불가 중심 2단계): 0=불가날짜, 1=특정날짜+시간(마지막=1). 도달한 단계까지 문장에 노출.
  const AVAIL_LAST_STEP = 1;
  const availClauseVisible = (i: number) => i <= maxAvailStep;
  const personName = selected?.name ?? identityName;
  const AVAIL_QUESTIONS = [
    `${personName}님, 회의가 불가능한 날짜가 있나요?`,
    "특별히 이 날 이 시간엔 안 되는 경우가 있나요?",
  ];

  useEffect(() => {
    const draft = readResponseDraft(window.sessionStorage, meetingId);
    if (draft) {
      skipFormFocus.current = true;
      skipNextAutoFocus.current = true;
      setStep(draft.step);
      setCaseId(draft.caseId);
      setSelectedId(draft.selectedId);
      setToken(draft.token);
      setRole(draft.role);
      setIdentityName(draft.identityName);
      setIdentityRole(draft.identityRole);
      setFormStep(draft.formStep);
      setMaxFormStep(draft.maxFormStep);
      setAvailStep(draft.availStep);
      setMaxAvailStep(draft.maxAvailStep);
      setBusyDates(new Set(draft.busyDates));
      setDateTimeBusy(draft.dateTimeBusy);
      setDtDate(draft.dtDate);
      setDraftStart(draft.draftStart);
      setDraftEnd(draft.draftEnd);
      setResponseDraftReady(true);
      return;
    }

    const raw = window.localStorage.getItem(storageKey(meetingId));
    if (!raw) {
      setStep("intro");
      setResponseDraftReady(true);
      return;
    }
    let parsed: { participantId?: string; token?: string } | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!parsed?.participantId || !parsed.token) {
      window.localStorage.removeItem(storageKey(meetingId));
      setStep("intro");
      setResponseDraftReady(true);
      return;
    }
    const identity = { participantId: parsed.participantId, token: parsed.token };
    setSelectedId(identity.participantId);
    setToken(identity.token);
    loadParticipantResponse({ meetingId, ...identity })
      .then((res) => {
        if (res.ok) {
          const found = participants.find((p) => p.id === identity.participantId);
          setRole(found?.role ?? "");
          setIdentityName(found?.name ?? "");
          setIdentityRole(found?.role ?? "");
          setStep("waiting");
        } else {
          window.localStorage.removeItem(storageKey(meetingId));
          clearResponseDraft(window.sessionStorage, meetingId);
          setSelectedId(null);
          setToken(null);
          setStep("intro");
        }
        setResponseDraftReady(true);
      })
      .catch(() => {
        setSelectedId(null);
        setToken(null);
        setStep("intro");
        setResponseDraftReady(true);
      });
    // 최초 1회만 실행.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!responseDraftReady || step === "loading") return;
    writeResponseDraft(window.sessionStorage, {
      meetingId,
      step,
      caseId,
      selectedId,
      token,
      role,
      identityName,
      identityRole,
      formStep,
      maxFormStep,
      availStep,
      maxAvailStep,
      busyDates: [...busyDates].sort(),
      dateTimeBusy,
      dtDate,
      draftStart,
      draftEnd,
    });
  }, [
    responseDraftReady,
    meetingId,
    step,
    caseId,
    selectedId,
    token,
    role,
    identityName,
    identityRole,
    formStep,
    maxFormStep,
    availStep,
    maxAvailStep,
    busyDates,
    dateTimeBusy,
    dtDate,
    draftStart,
    draftEnd,
  ]);

  function persistIdentity(participantId: string, tok: string) {
    window.localStorage.setItem(
      storageKey(meetingId),
      JSON.stringify({ participantId, token: tok }),
    );
  }

  function storedIdentity() {
    try {
      const raw = window.localStorage.getItem(storageKey(meetingId));
      return raw ? (JSON.parse(raw) as { participantId?: string; token?: string }) : null;
    } catch {
      return null;
    }
  }

  const showToast = (message: string, icon = "⚠️") => {
    setToastMessage(message);
    setToastIcon(icon);
    setToastOpen(true);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastOpen(false), 2600);
  };

  // 5단계 날짜 선택 모달: 배경 스크롤 잠금 + Esc 로 닫기.
  useScrollLock(dtModalOpen);
  useEffect(() => {
    if (!dtModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDtModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dtModalOpen]);

  // 모바일 시트 하단 CTA 경계 불빛: 추가/변경 후 아직 확인하지 않은 칩이
  // 스크롤 밖(아래)에 하나라도 있으면 하단 경계 전체가 깜빡인다.
  // 스크롤해서 칩이 보이면 그 칩은 확인된 것으로 빼고, 전부 확인되면 불빛이 꺼진다.
  const glowChipRefs = useRef(new Map<string, HTMLSpanElement>());
  const [glowPendingDates, setGlowPendingDates] = useState<Set<string>>(() => new Set());
  // pending 중 실제로 화면 아래에 가려져 있는 칩 날짜들 — 비어 있지 않으면 불빛 on.
  const [glowHiddenDates, setGlowHiddenDates] = useState<Set<string>>(() => new Set());

  const removeFromDateSet = (prev: Set<string>, ds: string) => {
    if (!prev.has(ds)) return prev;
    const next = new Set(prev);
    next.delete(ds);
    return next;
  };
  const clearGlowFor = (ds: string) => {
    setGlowPendingDates((prev) => removeFromDateSet(prev, ds));
    setGlowHiddenDates((prev) => removeFromDateSet(prev, ds));
  };

  useEffect(() => {
    if (!dtModalOpen) {
      setGlowPendingDates(new Set());
      setGlowHiddenDates(new Set());
    }
  }, [dtModalOpen]);

  useEffect(() => {
    if (!dtModalOpen || glowPendingDates.size === 0) return;
    const els = new Map<Element, string>();
    for (const ds of glowPendingDates) {
      const el = glowChipRefs.current.get(ds);
      if (el) els.set(el, ds);
      else clearGlowFor(ds); // 칩이 사라짐(그 날짜 전체 삭제 등) → 불빛도 정리.
    }
    if (els.size === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const ds = els.get(entry.target);
          if (!ds) continue;
          if (entry.isIntersecting) {
            // 사용자가 스크롤해서 칩을 확인함 → 확인 목록에서 제외.
            clearGlowFor(ds);
            continue;
          }
          const viewportH = entry.rootBounds?.height ?? window.innerHeight;
          if (entry.boundingClientRect.top > viewportH / 2) {
            // 화면 아래쪽에 가려진 경우에만 불빛 대상에 포함(위로 스크롤된 경우는 제외).
            setGlowHiddenDates((prev) => (prev.has(ds) ? prev : new Set(prev).add(ds)));
          } else {
            clearGlowFor(ds);
          }
        }
      },
      { threshold: 0.5 },
    );
    els.forEach((_ds, el) => observer.observe(el));
    return () => observer.disconnect();
    // dateTimeBusy 변경 시 재관찰(칩이 늘거나 줄면 가려짐 여부가 변함).
  }, [glowPendingDates, dtModalOpen, dateTimeBusy]);

  // 불가 입력(불가 날짜 + 특정 날짜+시간)을 cells → blocks(busy) 환원. busy 만 저장한다.
  function buildBlocks() {
    const cells: Record<string, CellStatus> = {};
    const lunchS = parseHm(lunchStart);
    const lunchE = parseHm(lunchEnd);
    const covers = (ranges: TimeRange[], minute: number) =>
      ranges.some((r) => minute >= r.start && minute + GRID_STEP_MINUTES <= r.end);
    dates.forEach((ds, dIdx) => {
      const dt = dateTimeBusy[ds] ?? [];
      for (const minute of rows) {
        // 점심시간과 겹치는 셀은 제외(서버가 점심 겹침 블록을 거부함)
        if (minute < lunchE && lunchS < minute + GRID_STEP_MINUTES) continue;
        // 불가 중심: 특정 날짜+시간 또는 불가 날짜(하루 전체)만 busy 로 저장.
        if (covers(dt, minute) || busyDates.has(ds)) {
          cells[cellKey(dIdx, minute)] = "busy";
        }
      }
    });
    return cellsToBlocks(cells, dates);
  }

  const addDraftRange = () => {
    if (!dtDate) return;
    const s = parseHm(draftStart);
    const e = parseHm(draftEnd);
    if (!(e > s)) {
      showToast("시작 시간이 종료보다 빨라야 해요.");
      return;
    }
    // 근무시간 밖 시간은 시간 선택기(TimeSelect)에서 컨펌을 거쳐 허용된 값이므로 여기서 막지 않는다.
    // 같은 날짜에 이미 추가한 것과 동일한 시간대는 중복 추가하지 않는다.
    const existing = dateTimeBusy[dtDate] ?? [];
    if (existing.some((x) => x.start === s && x.end === e)) {
      showToast("이미 추가한 시간대예요.");
      return;
    }
    const r: TimeRange = { start: s, end: e };
    setDateTimeBusy((p) => ({ ...p, [dtDate]: [...(p[dtDate] ?? []), r] }));
    // 모바일 시트에서 추가한 칩이 화면 밖에 있으면 CTA 경계 불빛으로 알린다.
    if (isMobile && dtModalOpen) {
      setGlowPendingDates((prev) => (prev.has(dtDate) ? prev : new Set(prev).add(dtDate)));
    }
  };

  const removeRange = (index: number, ds: string) => {
    setDateTimeBusy((p) => {
      const rest = (p[ds] ?? []).filter((_, i) => i !== index);
      const next = { ...p };
      if (rest.length) next[ds] = rest;
      else delete next[ds];
      return next;
    });
  };

  const toggleBusyDate = (ds: string) => {
    setBusyDates((prev) => {
      const next = new Set(prev);
      if (next.has(ds)) next.delete(ds);
      else next.add(ds);
      return next;
    });
  };

  // 특정 날짜+시간 시트 열기: '추가'는 날짜부터 새로 고르고, 요약 항목 탭은 그 날짜를 편집.
  const openDtAdd = () => {
    setDtDate(null);
    setDtModalOpen(true);
  };
  const openDtEdit = (ds: string) => {
    setDtDate(ds);
    setDtModalOpen(true);
  };
  // 그 날짜에 입력한 불가 시간을 모두 삭제한다.
  const removeWholeDate = (ds: string) => {
    setDateTimeBusy((p) => {
      const next = { ...p };
      delete next[ds];
      return next;
    });
    setDtDate((cur) => (cur === ds ? null : cur));
  };

  // 요약 리스트 카드를 왼쪽으로 밀며 흐려지는 애니메이션 후 실제 삭제(모바일 모달).
  const [removingDates, setRemovingDates] = useState<Set<string>>(new Set());
  const requestRemoveDate = (ds: string) => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      removeWholeDate(ds);
      return;
    }
    if (removingDates.has(ds)) return;
    setRemovingDates((prev) => new Set(prev).add(ds));
    window.setTimeout(() => {
      removeWholeDate(ds);
      setRemovingDates((prev) => {
        const next = new Set(prev);
        next.delete(ds);
        return next;
      });
    }, 250);
  };

  const goAvail = (next: number) => {
    setAvailStep(next);
    setMaxAvailStep((m) => Math.max(m, next));
  };
  const editAvailStep = (i: number) => setAvailStep(i);
  // 해당 단계 값이 입력됐는지. (없음=빈 값)
  const hasAvailValue = (i: number) =>
    [busyDates.size > 0, Object.keys(dateTimeBusy).length > 0][i] ?? false;
  // 값이 정해졌는지: 다음으로 넘어가 확정했거나(=i<max), 값이 입력된 경우.
  // 아직 안 정해진(현재 진행 중) 항목은 상단 문장에서 점 3개 로딩으로 표시한다.
  const availDetermined = (i: number) => i < maxAvailStep || hasAvailValue(i);
  // 회의만들기 상단 문장과 동일한 빈 값 자리표시(점 3개 파도타기, 클릭 시 해당 단계로).
  const availDots = (fieldLabel: string, onEdit: () => void) => (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${fieldLabel} 입력`}
      className="mx-1.5 inline-flex items-center rounded align-middle leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
    >
      <DotWave />
    </button>
  );
  const handleAvailNext = () => {
    if (availStep < AVAIL_LAST_STEP) goAvail(availStep + 1);
    else setStep("review");
  };

  // 특정 날짜의 안 되는 시간 범위 추가 입력(시작~종료 + 추가) + 추가된 범위 칩 목록.
  const renderTimeAdder = (
    ranges: TimeRange[],
    onRemove: (i: number) => void,
    showChips = true,
  ) => (
    <div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TimeSelect
            value={draftStart}
            onChange={setDraftStart}
            workStart={parseHm(workdayStart)}
            workEnd={parseHm(workdayEnd)}
            ariaLabel="시작 시간"
          />
        </div>
        <span className="shrink-0 text-slate-400">~</span>
        <div className="min-w-0 flex-1">
          <TimeSelect
            value={draftEnd}
            onChange={setDraftEnd}
            workStart={parseHm(workdayStart)}
            workEnd={parseHm(workdayEnd)}
            ariaLabel="종료 시간"
          />
        </div>
      </div>
      <TDSButton
        type="button"
        tone="secondary"
        size="md"
        display="block"
        className="mt-2"
        onClick={addDraftRange}
      >
        추가
      </TDSButton>
      {showChips && ranges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ranges.map((r, i) => (
            <span
              key={`${r.start}-${r.end}-${i}`}
              className="relative inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700 animate-fade-up-blur motion-reduce:animate-none"
            >
              {fmtRange(r)}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`${fmtRange(r)} 삭제`}
                className="ml-0.5 opacity-60 hover:opacity-100"
              >
                <ChipRemoveIcon />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const goToForm = (next: number) => {
    setFormStep(next);
    setMaxFormStep((m) => Math.max(m, next));
  };

  const editFormStep = (i: number) => setFormStep(i);

  const handleFormNext = () => {
    if (formStep === IDENTITY_LAST_STEP) {
      void handleVerifyIdentity();
    } else {
      // 모바일에서는 '다음'으로 넘어가도 다음 입력에 자동 포커스하지 않는다(직접 터치해야 활성화).
      skipNextAutoFocus.current = window.matchMedia("(max-width: 639px)").matches;
      goToForm(formStep + 1);
    }
  };

  const onFormFieldKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (formValid(formStep)) handleFormNext();
    }
  };

  // 값이 있으면 파란 EditValue, 없으면 dot 자리표시(클릭 시 해당 단계로 이동).
  const valueSlot = (
    empty: boolean,
    fieldLabel: string,
    onEdit: () => void,
    value: ReactNode,
  ) =>
    empty ? (
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${fieldLabel} 입력`}
        className="mx-1.5 inline-flex items-center rounded align-middle leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        <DotWave />
      </button>
    ) : (
      <EditValue fieldLabel={fieldLabel} onEdit={onEdit}>
        {value}
      </EditValue>
    );

  async function handleVerifyIdentity() {
    setVerifying(true);
    const saved = storedIdentity();
    const res = await verifyParticipantIdentity({
      meetingId,
      name: identityName,
      role: identityRole,
      token: saved?.token,
    });
    setVerifying(false);

    if (!res.ok) {
      showToast(res.error); // 유효성 오류는 아이콘 토스트로
      return;
    }

    // 다른 사람으로 확인되면 입력값 초기화(가능 시간은 새로 받는다).
    if (res.participantId !== selectedId) {
      setBusyDates(new Set());
      setDateTimeBusy({});
      setDtDate(null);
      setDraftStart(DEFAULT_DRAFT_START);
      setDraftEnd(DEFAULT_DRAFT_END);
    }

    setSelectedId(res.participantId);
    setToken(res.token);
    setIdentityName(res.name);
    setIdentityRole(res.role);
    setRole(res.role);

    setAvailStep(0);
    setMaxAvailStep(0);
    showToast("본인 확인 완료", "✅"); // 다음(가능 시간) 화면에서 잠깐 노출
    setStep("availability"); // 본인확인 완료 → 다음 화면
  }

  async function handleSubmit() {
    if (!selectedId) return;
    setSubmitting(true);
    const blocks = buildBlocks();
    const res = await submitAvailability({
      meetingId,
      participantId: selectedId,
      token,
      role,
      blocks,
    });
    setSubmitting(false);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setToken(res.token);
    persistIdentity(res.participantId, res.token);
    setStep("waiting");
  }

  const handleSelectCase = (id: number) => {
    setCaseId(id);
  };

  // 본인확인 단계가 바뀌면 입력에 포커스(최초 진입은 건너뜀, 스크롤 점프 방지).
  useEffect(() => {
    if (step !== "identity") return;
    if (skipFormFocus.current) {
      skipFormFocus.current = false;
      return;
    }
    if (skipNextAutoFocus.current) {
      skipNextAutoFocus.current = false;
      return;
    }
    document.getElementById(formStep === 0 ? "pName" : "pRole")?.focus({ preventScroll: true });
  }, [formStep, step]);

  // 입력 확인(review): 문장 조각과 글자 채움 타이밍(글자 수 비례)을 계산한다.
  const goBusyDatesEdit = () => {
    setAvailStep(0);
    setStep("availability");
  };
  const goDateTimesEdit = () => {
    setAvailStep(1);
    setStep("availability");
  };
  const busyDatesText =
    busyDates.size > 0 ? [...busyDates].sort().map(fmtMD).join(", ") : null;
  const dtText =
    Object.keys(dateTimeBusy).length > 0
      ? Object.entries(dateTimeBusy)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ds, rs]) => `${fmtMD(ds)} ${rs.map(fmtRange).join("·")}`)
          .join(", ")
      : null;
  const reviewClauses: CharFillSegment[][] = [
    [`${personName}님은`],
    busyDatesText
      ? [
          reviewValue(busyDatesText, "불가능한 날짜", goBusyDatesEdit),
          "에는 회의가 불가능하고,",
        ]
      : [reviewValue("불가능한 날짜는 없고,", "불가능한 날짜", goBusyDatesEdit)],
    dtText
      ? [
          "특별히 ",
          reviewValue(dtText, "특정 날짜 시간", goDateTimesEdit),
          "에는 안 돼요.",
        ]
      : [reviewValue("특정 시간에 안 되는 날은 없어요.", "특정 날짜 시간", goDateTimesEdit)],
  ];
  // 채움 종료 시각 → 안내 문구·CTA 등장 지연(글자 수 비례).
  const { fillEndMs: reviewFillEndMs } = charFillTiming(reviewClauses);
  const reviewHelpDelayMs = Math.max(0, reviewFillEndMs - 200); // 마지막 글자가 거의 채워진 뒤
  const reviewCtaDelayMs = reviewHelpDelayMs + 600;

  useEffect(() => {
    if (step !== "review") {
      setReviewCtaReady(false);
      return;
    }
    const timer = window.setTimeout(() => setReviewCtaReady(true), reviewCtaDelayMs);
    return () => window.clearTimeout(timer);
  }, [step, reviewCtaDelayMs]);

  // 입력 확인: 글자 채움이 끝나기 전에는 문장 속 키워드의 호버·클릭을 막는다.
  const [reviewFillDone, setReviewFillDone] = useState(false);
  useEffect(() => {
    if (step !== "review") {
      setReviewFillDone(false);
      return;
    }
    const timer = window.setTimeout(() => setReviewFillDone(true), reviewFillEndMs);
    return () => window.clearTimeout(timer);
  }, [step, reviewFillEndMs]);

  // 단계 화면이 바뀌면 스크롤을 맨 위로 되돌린다(이전 화면의 스크롤 위치가 이어지는 문제).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // 회의 안내(intro)를 벗어나면 CTA 준비 상태를 되돌린다(재진입 시 채움부터 다시).
  useEffect(() => {
    if (step !== "intro") setIntroCtaReady(false);
  }, [step]);

  if (step === "loading") {
    return (
      <Card className="mx-auto max-w-2xl">
        <p className="text-sm text-slate-500">불러오는 중...</p>
      </Card>
    );
  }

  if (step === "intro") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <DebugPageTag no={4} label="회의 안내" />
        <div className="flex-1">
          {/* 응답 플로우의 첫 화면이라 뒤로 갈 곳이 없다 — 뒤로가기 버튼 없이 타이틀만. */}
          <MobileHeaderTitle title="회의 안내" hideBack />
          <p className="hidden text-sm font-medium text-slate-400 sm:block">회의 안내</p>
          <MeetingSummarySentence
            className="sm:mt-3"
            fill
            onFillDone={() => setIntroCtaReady(true)}
            title={meetingTitle}
            agenda={agenda}
            location={location}
            deadlineDate={deadlineDate}
            responseDeadline={responseDeadline}
            durationMinutes={durationMinutes}
          />
        </div>
        <MobileStickyAction className="mt-8">
          {introCtaReady && (
            <div
              className="animate-fade-up-blur motion-reduce:animate-none"
              style={{ animationDuration: "1000ms" }}
            >
              <TDSButton
                size="xl"
                display="block"
                onClick={() => {
                  setFormStep(0);
                  setMaxFormStep(0);
                  setStep("identity");
                }}
              >
                시간 정하러 가기
              </TDSButton>
            </div>
          )}
        </MobileStickyAction>
      </div>
    );
  }

  // 입력 최종 확인 화면 → '다음' 으로 제출.
  if (step === "review") {
    return (
      <>
        <Toast open={toastOpen} message={toastMessage} icon={toastIcon} />
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          <DebugPageTag no={7} label="입력 확인" />
          <div className="flex-1">
            {/* 뒤로가기: 가능 시간 입력(마지막 단계)으로 복귀 */}
            <MobileHeaderTitle title="입력 확인" onBack={() => setStep("availability")} />
            <p className="hidden text-sm font-medium text-slate-400 sm:block">입력 확인</p>
            {/* 글자가 읽는 순서대로 좌→우 잉크처럼 칠해지는 등장(공용 CharFillSentence).
                채움이 끝나기 전에는 키워드 호버·클릭을 막는다. */}
            <div className={cn(!reviewFillDone && "pointer-events-none")}>
              <CharFillSentence
                className="text-left sm:mt-3"
                paragraphs={[{ clauses: reviewClauses }]}
              />
            </div>
            <p
              className="mt-5 animate-fade-up-blur text-sm text-slate-500 motion-reduce:animate-none"
              style={{
                animationDelay: `${reviewHelpDelayMs}ms`,
                animationDuration: "1000ms",
              }}
            >
              응답 시간 마감 전까지 수정할 수 있어요. 수정하려면 키워드를 눌러 응답 화면으로 이동하세요.
            </p>
          </div>
          <MobileStickyAction className="mt-auto">
            {reviewCtaReady && (
              <div
                className="animate-fade-up-blur motion-reduce:animate-none"
                style={{ animationDuration: `${REVIEW_CTA_DURATION_MS}ms` }}
              >
                <TDSButton
                  size="xl"
                  display="block"
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                  loading={submitting}
                >
                  {submitting ? "제출 중..." : "다음"}
                </TDSButton>
              </div>
            )}
          </MobileStickyAction>
        </div>
      </>
    );
  }

  // 제출 후 대기 화면 — 응답 마감 시각까지 기다린 뒤 후보/캘린더로 이동.
  if (step === "waiting") {
    return (
      <>
        <DebugPageTag no={8} label="응답 완료" />
        <WaitingScreen
          responseDeadline={responseDeadline}
          totalParticipants={participants.length}
          onProceed={() => setStep("result")}
          onEdit={() => {
            setAvailStep(0);
            setMaxAvailStep(0);
            setStep("availability");
          }}
        />
      </>
    );
  }

  // 제출 후 결과 화면 — modu 의 판단(해석 문장 + 후보 그룹) 설명. 투표 없음. 캘린더는 버튼으로 이동.
  if (step === "result") {
    return (
      <>
        <DebugPageTag no={9} label="추천 시간" />
        <ResultScreen
          caseId={caseId}
          onSelectCase={handleSelectCase}
          dates={dates}
          durationMinutes={durationMinutes}
          workdayStart={workdayStart}
          workdayEnd={workdayEnd}
          onViewCalendar={() => setStep("done")}
        />
      </>
    );
  }

  if (step === "done") {
    return (
      <>
        <DebugPageTag no={10} label="회의 캘린더" />
        <SubmittedCalendarScreenWide
          caseId={caseId}
          onSelectCase={handleSelectCase}
          dates={dates}
          durationMinutes={durationMinutes}
          workdayStart={workdayStart}
          workdayEnd={workdayEnd}
          lunchStart={lunchStart}
          lunchEnd={lunchEnd}
          onBack={() => setStep("result")}
        />
      </>
    );
  }

  // step === "identity": 본인확인(이름 → 직무) 문장 빌더.
  if (step === "identity") {
    return (
      <>
        <Toast open={toastOpen} message={toastMessage} icon={toastIcon} />
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          <DebugPageTag no={5} label="본인 확인" />
          <div className="flex-1">
            {/* 뒤로가기: 직무 단계면 이름 단계로, 이름 단계면 회의 안내로 */}
            <MobileHeaderTitle
              title="본인 확인"
              onBack={() => {
                // 뒤로가기 = 방금 입력하던 단계의 값 되돌리기(모바일 전용 동선).
                if (formStep > 0) {
                  skipNextAutoFocus.current = true;
                  setIdentityRole("");
                  setFormStep(formStep - 1);
                } else {
                  setIdentityName("");
                  setStep("intro");
                }
              }}
            />
            <p className="hidden text-sm font-medium text-slate-400 sm:block">본인 확인</p>
            <div
              aria-live="polite"
              className="break-keep text-left text-2xl leading-relaxed text-slate-800 sm:mt-3 sm:text-3xl sm:leading-relaxed"
            >
              <p>
                {clauseVisible(0) && (
                  <span className="relative animate-fade-up-blur motion-reduce:animate-none">
                    저는{" "}
                    {valueSlot(identityName.trim() === "", "이름", () => editFormStep(0), identityName)}
                    이고,{" "}
                  </span>
                )}
                {clauseVisible(1) && (
                  <span className="relative animate-fade-up-blur motion-reduce:animate-none">
                    직무는{" "}
                    {valueSlot(identityRole.trim() === "", "직무", () => editFormStep(1), identityRole)}
                    {hasBatchim(identityRole) ? "이에요." : "예요."}
                  </span>
                )}
              </p>
            </div>
          </div>

          <MobileStickyAction className="mt-8">
            <div key={formStep}>
              {formStep === 0 ? (
                <>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Label htmlFor="pName" className="mb-0 text-lg">
                      이름을 입력해주세요
                    </Label>
                    <HelpTooltip text="참석자 명단에 있는 분만 응답할 수 있도록 본인 확인을 해요. 입력한 이름·직무가 명단과 일치하면 다음 단계로 넘어가요." />
                  </div>
                  <Input
                    id="pName"
                    value={identityName}
                    onChange={(e) => setIdentityName(e.target.value)}
                    onKeyDown={onFormFieldKeyDown}
                    placeholder="이름 입력"
                    autoComplete="name"
                  />
                </>
              ) : (
                <>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Label htmlFor="pRole" className="mb-0 text-lg">
                      직무를 선택해주세요
                    </Label>
                    <HelpTooltip text="참석자 명단에 있는 분만 응답할 수 있도록 본인 확인을 해요. 입력한 이름·직무가 명단과 일치하면 다음 단계로 넘어가요." />
                  </div>
                  <Select
                    variant="menu"
                    id="pRole"
                    aria-label="직무"
                    value={identityRole}
                    onValueChange={setIdentityRole}
                    options={[
                      { value: "", label: "직무 선택" },
                      ...roleOptions.map((option) => ({ value: option, label: option })),
                    ]}
                  />
                </>
              )}
            </div>

            <div className="mt-4">
              {formStep === IDENTITY_LAST_STEP ? (
                <TDSButton
                  size="xl"
                  display="block"
                  onClick={handleFormNext}
                  disabled={!formValid(1) || verifying}
                  loading={verifying}
                >
                  {verifying ? "확인 중..." : "확인하고 다음"}
                </TDSButton>
              ) : (
                <TDSButton
                  size="xl"
                  display="block"
                  onClick={handleFormNext}
                  disabled={!formValid(formStep)}
                >
                  다음
                </TDSButton>
              )}
            </div>
          </MobileStickyAction>
        </div>
      </>
    );
  }

  // step === "availability": 가능 시간 문장 빌더(5단계).
  return (
    <>
      <Toast open={toastOpen} message={toastMessage} icon={toastIcon} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <DebugPageTag no={6} label="가능 시간" />
        {/* 상단: 답변이 쌓이는 문장 */}
        {/* 뒤로가기: 특정 날짜+시간 단계면 불가 날짜 단계로, 그 전이면 본인 확인으로 */}
        <MobileHeaderTitle
          title="가능 시간"
          onBack={() => {
            // 뒤로가기 = 방금 입력하던 단계의 값 되돌리기(모바일 전용 동선).
            if (availStep > 0) {
              setDateTimeBusy({});
              setDtDate(null);
              editAvailStep(availStep - 1);
            } else {
              setBusyDates(new Set());
              setStep("identity");
            }
          }}
        />
        <p className="hidden text-sm font-medium text-slate-400 sm:block">가능 시간</p>
        <div
          aria-live="polite"
          className="break-keep text-left text-2xl leading-relaxed text-slate-800 sm:mt-3 sm:text-3xl sm:leading-relaxed"
        >
          {availClauseVisible(0) && (
            <span className="relative animate-fade-up-blur motion-reduce:animate-none">
              저는{" "}
              {!availDetermined(0) ? (
                <>
                  {availDots("불가능한 날짜", () => editAvailStep(0))}
                  에는 회의가 불가능하고,{" "}
                </>
              ) : busyDates.size > 0 ? (
                <>
                  <EditValue fieldLabel="불가능한 날짜" tone="negative" onEdit={() => editAvailStep(0)}>
                    {[...busyDates].sort().map(fmtMD).join(", ")}
                  </EditValue>
                  에는 회의가 불가능하고,{" "}
                </>
              ) : (
                <EditValue fieldLabel="불가능한 날짜" tone="negative" onEdit={() => editAvailStep(0)}>
                  불가능한 날짜는 없고,
                </EditValue>
              )}{" "}
            </span>
          )}
          {availClauseVisible(1) && (
            <span className="relative animate-fade-up-blur motion-reduce:animate-none">
              {!availDetermined(1) ? (
                <>
                  특별히 {availDots("특정 날짜 시간", () => editAvailStep(1))}
                  에는 안 돼요.
                </>
              ) : Object.keys(dateTimeBusy).length > 0 ? (
                <>
                  특별히{" "}
                  <EditValue fieldLabel="특정 날짜 시간" tone="negative" onEdit={() => editAvailStep(1)}>
                    {Object.entries(dateTimeBusy)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([ds, rs]) => `${fmtMD(ds)} ${rs.map(fmtRange).join("·")}`)
                      .join(", ")}
                  </EditValue>
                  에는 안 돼요.
                </>
              ) : (
                <EditValue fieldLabel="특정 날짜 시간" tone="negative" onEdit={() => editAvailStep(1)}>
                  특정 시간에 안 되는 날은 없어요.
                </EditValue>
              )}
            </span>
          )}
        </div>

        {/* 질문 + 단계별 입력 — 페이지 하단으로 내려 배치(mt-auto) */}
        <div key={availStep} className="mt-auto pt-6">
          {/* 하단 입력 타이틀: 회의 만들기(2번) 하단 Label 과 동일 서식(text-lg + mb-1.5). */}
          <p className="mb-1.5 text-lg font-semibold text-slate-700">
            {AVAIL_QUESTIONS[availStep]}
          </p>
          <div>
            {availStep === 0 && (
              <CalendarModalField
                title="불가능한 날짜"
                placeholder="날짜 선택"
                dates={dates}
                selected={busyDates}
                onToggle={toggleBusyDate}
                tone="busy"
              />
            )}
            {availStep === 1 && (
              <div className="space-y-3">
                {/* 날짜+시간을 한 전체화면 시트에서 함께 고른다. '추가'는 날짜부터 새로. */}
                <button
                  type="button"
                  onClick={openDtAdd}
                  aria-haspopup="dialog"
                  aria-expanded={dtModalOpen}
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-sm transition-colors hover:border-slate-400 focus:border-2 focus:border-brand-400 focus:outline-none focus:ring-0"
                >
                  <span
                    className={
                      Object.keys(dateTimeBusy).length > 0
                        ? "font-semibold text-brand-600"
                        : "text-slate-400"
                    }
                  >
                    {Object.keys(dateTimeBusy).length > 0 ? "다른 날 추가하기" : "날짜 선택"}
                  </span>
                  <Emoji symbol="📅" size={16} />
                </button>

                {/* 데스크톱: 날짜 모달을 닫은 뒤 페이지에서 그 날의 안 되는 시간을 입력(이전 방식).
                    카드 내부 시간 벳지(showChips)는 끄고, 아래 요약 벳지로만 노출한다. */}
                {!isMobile && dtDate && (
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-sm font-bold text-slate-700">{fmtMD(dtDate)} 안 되는 시간</p>
                    <div className="mt-2">
                      {renderTimeAdder(dateTimeBusy[dtDate] ?? [], (i) => removeRange(i, dtDate), false)}
                    </div>
                  </div>
                )}

                {/* 입력한 '이 날 이 시간' 요약 — 탭하면 (모바일)시트/(PC)카드에서 수정, ✕ 로 그 날 전체 삭제 */}
                {Object.keys(dateTimeBusy).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(dateTimeBusy)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([ds, ranges]) => (
                        <span
                          key={ds}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700 motion-reduce:animate-none",
                            removingDates.has(ds) ? "animate-fade-out" : "animate-fade-in",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => (isMobile ? openDtEdit(ds) : setDtDate(ds))}
                            className="break-keep text-left focus:outline-none"
                          >
                            {fmtMD(ds)} {ranges.map(fmtRange).join(", ")}
                          </button>
                          <button
                            type="button"
                            onClick={() => requestRemoveDate(ds)}
                            aria-label={`${fmtMD(ds)} 삭제`}
                            className="ml-0.5 opacity-60 hover:opacity-100"
                          >
                            <ChipRemoveIcon />
                          </button>
                        </span>
                      ))}
                  </div>
                )}

                {/* 날짜 선택 시트(모바일=전체화면+시간 입력기까지, 데스크톱=가운데 카드·날짜만) */}
                {dtModalOpen && (
                  <CalendarModal
                    open={dtModalOpen}
                    title="특정 시간이 안 되는 날"
                    subtitle={
                      isMobile
                        ? dtDate
                          ? `${fmtMD(dtDate)}에 안 되는 시간을 추가하세요`
                          : "날짜를 고르면 시간을 추가할 수 있어요"
                        : "안 되는 날짜를 골라주세요"
                    }
                    isMobile={isMobile}
                    dates={dates}
                    selected={new Set([...Object.keys(dateTimeBusy), ...(dtDate ? [dtDate] : [])])}
                    onToggle={(ds) => {
                      setDtDate(ds);
                      // 데스크톱은 날짜를 고르면 모달을 닫고 페이지에서 시간을 입력(이전 방식).
                      if (!isMobile) setDtModalOpen(false);
                    }}
                    tone="busy"
                    blockedDates={busyDates}
                    ctaGlow={glowHiddenDates.size > 0}
                    extra={
                      isMobile ? (
                        <div className="space-y-3">
                          {dtDate ? (
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-sm font-bold text-slate-700">
                                {fmtMD(dtDate)} 안 되는 시간
                              </p>
                              <div className="mt-2">
                                {renderTimeAdder(dateTimeBusy[dtDate] ?? [], (i) => removeRange(i, dtDate), false)}
                              </div>
                            </div>
                          ) : (
                            <p className="text-center text-xs text-slate-400">
                              날짜를 고르면 안 되는 시간을 추가할 수 있어요.
                            </p>
                          )}

                          {/* 지금까지 추가한 모든 날짜의 안 되는 시간 — 벳지 형태로 노출([F4]) */}
                          {Object.keys(dateTimeBusy).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(dateTimeBusy)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([ds, ranges]) => (
                                  <span
                                    key={ds}
                                    ref={(el) => {
                                      if (el) glowChipRefs.current.set(ds, el);
                                      else glowChipRefs.current.delete(ds);
                                    }}
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold motion-reduce:animate-none",
                                      removingDates.has(ds)
                                        ? "animate-fade-out"
                                        : "animate-fade-in",
                                      ds === dtDate
                                        ? "bg-red-100 text-red-700 ring-1 ring-red-300"
                                        : "bg-red-50 text-red-700",
                                    )}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setDtDate(ds)}
                                      className="break-keep text-left focus:outline-none"
                                    >
                                      {fmtMD(ds)} {ranges.map(fmtRange).join(", ")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => requestRemoveDate(ds)}
                                      aria-label={`${fmtMD(ds)} 삭제`}
                                      className="ml-0.5 opacity-60 hover:opacity-100"
                                    >
                                      <ChipRemoveIcon />
                                    </button>
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      ) : undefined
                    }
                    onClose={() => setDtModalOpen(false)}
                    onConfirm={() => setDtModalOpen(false)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
        {/* 하단 고정 CTA */}
        <MobileStickyAction className="mt-4">
          <TDSButton size="xl" display="block" onClick={handleAvailNext}>
            다음
          </TDSButton>
        </MobileStickyAction>
      </div>
    </>
  );
}

// 제품 흐름 데모용 케이스 선택 (후보·캘린더 화면 공용).
// 평소엔 선택한 케이스만, 마우스 호버(또는 탭)하면 1~8번 전부 노출.
function CaseSelector({ caseId, onSelect }: { caseId: number; onSelect: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  // 선택된 케이스가 항상 맨 왼쪽(첫 번째)에 오도록 정렬한다.
  const ordered = [caseId, ...DEMO_CASES.map((c) => c.id).filter((id) => id !== caseId)];
  const GAP = 40; // 칩 간격(px)
  const expandedWidth = (DEMO_CASES.length - 1) * GAP + 32;
  return (
    <div className="select-none">
      <div className="relative flex items-center gap-1.5">
        <p className="text-xs font-bold text-slate-400">케이스 선택</p>
        {/* 데모 안내: 케이스 선택은 흐름 파악용 임시 영역이라는 점을 ? 아이콘 툴팁으로 알린다. */}
        <button
          type="button"
          aria-label="케이스 선택 영역 안내"
          className="peer flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold leading-none text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
        >
          ?
        </button>
        {/* 폭을 넓혀 두 줄로 보이게 하고, 모바일에서 화면 밖으로 넘치지 않도록 뷰포트 기준으로 제한한다. */}
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-7 z-30 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 peer-hover:opacity-100 peer-focus:opacity-100"
        >
          지금 보이는 케이스 선택은 사용 흐름을 파악하기 위해 임의로 노출한 영역이에요. 실제 사용 시에는 보이지 않아요.
        </span>
      </div>
      {/* 호버 시 너비가 늘며 마우스 인식 영역을 제어. 안의 칩들은 절대배치로 펼쳐진다. */}
      <div
        className="relative mt-1.5 h-8 cursor-pointer transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: hovered ? `${expandedWidth}px` : "32px" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {DEMO_CASES.map((c) => {
          // 정렬된 배열 안에서 이 칩이 차지할 위치(선택 칩=0=맨 왼쪽).
          const index = ordered.indexOf(c.id);
          const isSelected = c.id === caseId;
          const visible = hovered || isSelected;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              aria-pressed={isSelected}
              aria-label={`케이스 ${c.id} ${c.title}`}
              style={{
                transform: `translateX(${hovered ? index * GAP : 0}px)`,
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? "auto" : "none",
              }}
              className={cn(
                "absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all duration-500 ease-out motion-reduce:transition-none",
                isSelected
                  ? "z-20 scale-100 bg-brand-500 text-white shadow-md"
                  : "z-10 scale-95 border border-slate-200 bg-white text-slate-600 shadow-sm hover:scale-100 hover:bg-slate-50",
              )}
            >
              {c.id}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 선택된 케이스의 상황·판단·경고 설명.
function CaseDescription({ caseId }: { caseId: number }) {
  const current = DEMO_CASES.find((c) => c.id === caseId) ?? DEMO_CASES[0];
  return (
    <div className="rounded-2xl bg-slate-50 p-3.5">
      <p className="text-sm font-extrabold text-slate-900">
        케이스 {current.id}. {current.title}
      </p>
      <div className="mt-2 space-y-1.5">
        <p className="flex gap-1.5 break-keep text-sm text-slate-600">
          <span className="shrink-0 font-bold text-slate-400">상황</span>
          <span>{current.situation}</span>
        </p>
        <p className="flex gap-1.5 break-keep text-sm text-slate-700">
          <span className="shrink-0 font-bold text-brand-600">솔루션</span>
          <span>{current.judgment}</span>
        </p>
      </div>
      {current.banner && (
        <p
          className={cn(
            "mt-2.5 break-keep rounded-xl px-2.5 py-2 text-xs font-bold",
            // 2색 체계: caution 도 빨강 계열(danger 보다 옅게)로 — 앰버는 쓰지 않는다.
            current.banner.tone === "danger"
              ? "bg-red-50 text-red-700"
              : current.banner.tone === "caution"
                ? "bg-red-50/70 text-red-500"
                : "bg-brand-50 text-brand-700",
          )}
        >
          {current.banner.text}
        </p>
      )}
    </div>
  );
}

// 모바일 전용: 케이스 선택을 플로팅 버튼으로 접어둔다(데모 컨트롤이 화면을 차지하지 않게).
// 현재 케이스 번호 버튼을 탭하면 케이스 칩 8개 + 설명 패널이 열리고, 바깥 탭/✕/Esc 로 닫힌다.
// inline: 우하단 고정 대신 본문 상단 행(응답 칩과 같은 줄)에 작은 버튼으로 배치한다(추천 시간 화면).
function FloatingCaseSelector({
  caseId,
  onSelect,
  aboveCta = false,
  inline = false,
}: {
  caseId: number;
  onSelect: (id: number) => void;
  // 하단 고정 CTA(MobileStickyAction)가 있는 화면에서는 그 위로 띄운다.
  aboveCta?: boolean;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const bottomClass = aboveCta
    ? "bottom-[calc(7rem+env(safe-area-inset-bottom))]"
    : "bottom-[calc(1.25rem+env(safe-area-inset-bottom))]";

  if (inline) {
    return (
      <div className="relative sm:hidden" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`케이스 선택 열기 (현재 케이스 ${caseId})`}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white shadow-md shadow-brand-500/30 transition-transform active:scale-95"
        >
          {caseId}
        </button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-900/30 animate-fade-in motion-reduce:animate-none"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="케이스 선택"
              className="absolute left-0 top-10 z-50 w-[calc(100vw-2rem)] max-w-[22rem] rounded-2xl bg-white p-4 shadow-2xl animate-fade-up motion-reduce:animate-none"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">케이스 선택</p>
                  <p className="mt-0.5 break-keep text-xs text-slate-400">
                    사용 흐름을 보여주기 위한 데모 영역이에요. 실제 사용 화면에는 보이지 않아요.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="케이스 선택 닫기"
                  className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <Emoji symbol="✕" size={16} />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEMO_CASES.map((c) => {
                  const isSelected = c.id === caseId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelect(c.id)}
                      aria-pressed={isSelected}
                      aria-label={`케이스 ${c.id} ${c.title}`}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors",
                        isSelected
                          ? "bg-brand-500 text-white shadow-md"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {c.id}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3">
                <CaseDescription caseId={caseId} />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="sm:hidden" onClick={(e) => e.stopPropagation()}>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/30 animate-fade-in motion-reduce:animate-none"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="케이스 선택"
            className={cn(
              "fixed right-4 z-40 w-[calc(100vw-2rem)] max-w-[22rem] rounded-2xl bg-white p-4 shadow-2xl animate-fade-up motion-reduce:animate-none",
              bottomClass,
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">케이스 선택</p>
                <p className="mt-0.5 break-keep text-xs text-slate-400">
                  사용 흐름을 보여주기 위한 데모 영역이에요. 실제 사용 화면에는 보이지 않아요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="케이스 선택 닫기"
                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Emoji symbol="✕" size={16} />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {DEMO_CASES.map((c) => {
                const isSelected = c.id === caseId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-pressed={isSelected}
                    aria-label={`케이스 ${c.id} ${c.title}`}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors",
                      isSelected
                        ? "bg-brand-500 text-white shadow-md"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {c.id}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <CaseDescription caseId={caseId} />
            </div>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`케이스 선택 열기 (현재 케이스 ${caseId})`}
          className={cn(
            "fixed right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-base font-bold text-white shadow-lg shadow-brand-500/30 transition-transform active:scale-95",
            bottomClass,
          )}
        >
          {caseId}
        </button>
      )}
    </div>
  );
}

// 제출 후 결과 화면: 케이스별 응답 현황 + 후보 순위(더미). 캘린더는 '캘린더 보기'로 이동.
function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M5 10.5 8.5 14 15 6.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarLineIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 추천안(순위 리스트) 아이콘 — 캘린더 화면에서 추천안 화면으로 돌아가는 버튼용.
function RankListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M9.5 6h11M9.5 12h11M9.5 18h11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 제출 후 대기 화면(세로형 스텝퍼 + 응답 마감 카운트다운).
// 제품 흐름 확인 단계라 타이머는 5초 고정이며, 0이 되면 후보/캘린더로 넘어갈 수 있다.
function WaitingScreen({
  totalParticipants,
  onProceed,
  onEdit,
}: {
  responseDeadline?: string | null;
  totalParticipants: number;
  onProceed: () => void;
  onEdit: () => void;
}) {
  const WAIT_SECONDS = 7; // 실제 서비스에서는 응답 마감 시각까지의 남은 시간으로 대체.
  const total = Math.max(1, totalParticipants);
  const [remaining, setRemaining] = useState(WAIT_SECONDS);
  // 응답률(데모): 내 응답 1건에서 시작해 마감 전에 전원 응답으로 수렴한다.
  const [responded, setResponded] = useState(() => Math.min(total, 1));

  useEffect(() => {
    const startedAt = Date.now();
    setRemaining(WAIT_SECONDS);
    setResponded(Math.min(total, 1));
    // 마감 약 2초 전에 전원 응답이 도착하도록(마감 전 완료 시나리오 시연).
    const fillSeconds = Math.max(3, WAIT_SECONDS - 2);
    const id = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const left = Math.max(0, WAIT_SECONDS - Math.floor(elapsed));
      const filled = Math.min(total, 1 + Math.floor(((total - 1) * elapsed) / fillSeconds));
      setRemaining(left);
      setResponded(filled);
      if (left <= 0 || filled >= total) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [total]);

  // 마감 시간이 지나거나, 마감 전이라도 전원이 응답하면 추천 시간을 열람할 수 있다.
  const allResponded = responded >= total;
  const ready = allResponded || remaining <= 0;
  const mmss = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(
    remaining % 60,
  ).padStart(2, "0")}`;

  // 응답 마감(ready)이 되면 마지막 스텝(추천 확인)이 활성화(current)된다.
  type StepState = "done" | "current" | "todo";
  const steps: { state: StepState; label: string }[] = ready
    ? [
        { state: "done", label: "내 가능한 시간을 보냈어요" },
        { state: "done", label: "다른 참여자들의 응답을 받았어요" },
        { state: "current", label: "추천 시간을 확인해보세요" },
      ]
    : [
        { state: "done", label: "내 가능한 시간을 보냈어요" },
        { state: "current", label: "다른 참여자들의 응답을 기다리고 있어요" },
        { state: "todo", label: "추천 시간을 확인해보세요" },
      ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col pt-2">
      <div className="flex-1">
        <div className="relative animate-fade-up-blur" style={{ animationDuration: "0.6s" }}>
          {/* 응답 제출을 마친 화면 — 뒤로가기 없이 타이틀만(수정은 '내 응답 수정하기'로). */}
          <MobileHeaderTitle title="응답 완료" hideBack />
          <p className="hidden text-sm font-medium text-slate-400 sm:block">응답 완료</p>
          <h1 className="break-keep text-2xl font-extrabold leading-snug tracking-tight text-slate-900 sm:mt-3 sm:text-3xl sm:leading-snug">
            이제 모두가 응답하면
            <br />
            가장 좋은 시간을 찾아드려요
          </h1>
        </div>

        <ol className="mt-8">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <li
                key={i}
                className={cn(
                  // 스텝 사이 간격은 고정 높이로 통일 — 카운트다운 pill 이 두 번째 스텝에 들어갈 만큼
                  // 넉넉히 잡아, pill 유무(카운트다운 진행/완료)와 무관하게 간격이 변하지 않는다.
                  "relative flex animate-fade-up-blur gap-4",
                  // 모바일은 살짝 좁게(2줄 라벨+pill+마감일 최소 높이), 데스크톱은 조금 더 넉넉하게.
                  !isLast && "h-[8rem] sm:h-[8.5rem]",
                )}
                style={{ animationDelay: `${150 + i * 220}ms`, animationDuration: "0.6s" }}
              >
                {!isLast && (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute left-[20.5px] top-[50px] h-[calc(100%-56px)] w-[3px] rounded-full bg-slate-200"
                    />
                    {/* 위 스텝이 완료(done)된 구간만 파랗게 채움 — 카운트다운 완료 시 다음 구간이 순서대로 이어짐 */}
                    {s.state === "done" && (
                      <span
                        aria-hidden="true"
                        style={{ animationDelay: `${260 + i * 220}ms` }}
                        className="modu-line-fill absolute left-[20.5px] top-[50px] h-[calc(100%-56px)] w-[3px] origin-top rounded-full bg-brand-500"
                      />
                    )}
                  </>
                )}
                <span className="relative z-10 shrink-0">
                  {s.state === "done" ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white">
                      <CheckIcon />
                    </span>
                  ) : s.state === "current" ? (
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-brand-50">
                      {/* 카운트다운 진행 중에는 느리고 부드러운 원형 pulse */}
                      {!ready && (
                        <span
                          aria-hidden="true"
                          className="modu-pulse-ring absolute inset-0 rounded-full bg-brand-400"
                        />
                      )}
                      <span className="relative h-3 w-3 rounded-full bg-brand-500" />
                    </span>
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-base font-bold text-slate-400">
                      {i + 1}
                    </span>
                  )}
                </span>
                <div className="pt-2.5">
                  {i === 1 ? (
                    // 대기중 → 완료 전환: 문장 '전체'(색상 포함)를 겹쳐서 교체한다.
                    // 대기 문장(brand-600)은 페이드아웃, 완료 문장(slate-800)은 clip-path 로
                    // 문장 맨 앞부터 좌→우로 쓸려 드러나 색까지 처음부터 바뀐다.
                    <p className="relative break-keep text-lg font-bold">
                      <span
                        aria-hidden={ready}
                        className={cn(
                          "text-brand-600 transition-opacity duration-700 delay-300",
                          ready ? "opacity-0" : "opacity-100",
                        )}
                      >
                        다른 참여자들의 응답을 기다리고 있어요
                      </span>
                      <span
                        aria-hidden={!ready}
                        className="absolute inset-0 break-keep text-slate-800"
                        style={{
                          clipPath: ready ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
                          transition: "clip-path 1.2s cubic-bezier(0.65, 0, 0.35, 1)",
                        }}
                      >
                        다른 참여자들의 응답을 받았어요
                      </span>
                    </p>
                  ) : (
                    <p
                      className={cn(
                        "break-keep text-lg font-bold",
                        s.state === "current"
                          ? "text-brand-600"
                          : s.state === "done"
                            ? "text-slate-800"
                            : "text-slate-400",
                      )}
                    >
                      {s.label}
                    </p>
                  )}
                  {/* 두 번째 스텝: 응답률(사람 아이콘 N/M) + 마감 카운트다운. 고정 높이라 pill 유무로 간격이 안 바뀐다. */}
                  {s.state === "current" && !ready && (
                    <>
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5">
                        <Emoji symbol="👥" size={16} />
                        <span className="text-sm font-bold tabular-nums text-brand-700">
                          {responded}/{total} 응답 완료
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-400">응답 마감까지 {mmss}</p>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <MobileStickyAction className="mt-8">
        <div className="space-y-2">
          {/* 카운트다운 진행 중에는 파란 CTA '위'에 응답 수정 링크 노출(완료 후에는 숨김) */}
          {!ready && (
            <button
              type="button"
              onClick={onEdit}
              className="block w-full rounded-xl py-2 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-700"
            >
              내 응답 수정하기
            </button>
          )}
          <TDSButton size="xl" display="block" onClick={onProceed} disabled={!ready}>
            {ready ? "추천 시간 확인하러 가기" : `잠시만요… ${mmss}`}
          </TDSButton>
        </div>
      </MobileStickyAction>
    </div>
  );
}

// 투표 없는 결과 화면 — 후보 카드는 선택 대상이 아니라 modu 의 판단을 설명하는 카드다.
// (색·그룹·문장은 contextualResult 가 만든다. modu 는 확정하지 않는다 —
//  최종 회의 시간은 참여자들이 추천안을 보고 제품 밖에서 정한다.)
function ResultScreen({
  caseId,
  onSelectCase,
  dates,
  durationMinutes,
  workdayStart,
  workdayEnd,
  onViewCalendar,
}: {
  caseId: number;
  onSelectCase: (id: number) => void;
  dates: string[];
  durationMinutes: number;
  workdayStart: string;
  workdayEnd: string;
  onViewCalendar: () => void;
}) {
  const current = DEMO_CASES.find((c) => c.id === caseId) ?? DEMO_CASES[0];
  const candidates = useMemo(() => buildCaseCandidates(current, dates), [current, dates]);
  const total = DEMO_PEOPLE.length;

  // 특정 시간 검색(조회 전용) — 케이스별 더미 응답 스냅샷으로 계산한다.
  const snapshot = useMemo(() => buildCaseSnapshot(current, dates), [current, dates]);
  const [searchResult, setSearchResult] = useState<AvailabilityLookupResult | null>(null);
  // 후보 필터 — 그룹별로 나눠 보는 탐색 보조(투표/확정 아님).
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>("all");
  useEffect(() => {
    setSearchResult(null);
    setCandidateFilter("all");
  }, [caseId]);

  // 같은 조건의 후보는 같은 그룹으로 — 무의미한 1·2·3순위 구분 대신 그룹 라벨로 보여준다.
  const contextual = useMemo(
    () => buildContextualScheduleResult(adaptDemoCaseToEvaluatedSlots(current, dates)),
    [current, dates],
  );
  const candidateGroups = useMemo(() => {
    const indexByKey = new Map<string, number>();
    candidates.forEach((c, i) => indexByKey.set(`${c.startAt}|${c.endAt}`, i));
    return contextual.rankGroups
      .map((group) => ({
        kind: group.kind,
        label: group.label,
        indexes: group.slots
          .map((slot) => indexByKey.get(`${slot.startAt}|${slot.endAt}`))
          .filter((i): i is number => i != null),
      }))
      .filter((group) => group.indexes.length > 0);
  }, [contextual, candidates]);
  // 필터 적용 — kind 기준(label 문자열에 의존하지 않는다).
  const visibleCandidateGroups = useMemo(
    () => candidateGroups.filter((group) => rankGroupKindMatchesFilter(group.kind, candidateFilter)),
    [candidateGroups, candidateFilter],
  );
  const filterCounts = useMemo(() => {
    const counts = {} as Record<CandidateFilter, number>;
    for (const option of CANDIDATE_FILTER_OPTIONS) {
      counts[option.value] = candidateGroups
        .filter((group) => rankGroupKindMatchesFilter(group.kind, option.value))
        .reduce((sum, group) => sum + group.indexes.length, 0);
    }
    return counts;
  }, [candidateGroups]);
  // 그룹 순서대로 하나씩 페이드인시키기 위한 표시 순번(필터 적용 후 기준).
  const cardOrder = useMemo(() => {
    const order = new Map<number, number>();
    visibleCandidateGroups.forEach((group) => {
      group.indexes.forEach((i) => order.set(i, order.size));
    });
    return order;
  }, [visibleCandidateGroups]);

  return (
    <div
      // 레이아웃 기준은 회의 만들기 페이지: 페이지 전체 스크롤 구조.
      // 본문이 흐르고 콘텐츠가 fixed 헤더/CTA 의 그라데이션 아래로 지나간다.
      // 본문은 헤더에 붙고 상단 여백(pt-4/sm:pt-8)을 본문 안쪽 패딩으로 갖는다
      // (공유 main 의 pt 는 음수 마진으로 상쇄).
      className="-mt-4 mx-auto flex w-full max-w-2xl flex-1 flex-col sm:-mt-8"
    >
      <div className="flex flex-1 flex-col gap-3 pt-4 sm:pt-8">
        {/* 결과 화면 — 뒤로가기 버튼 없이 타이틀만. */}
        <MobileHeaderTitle title="추천 시간" hideBack />
        <div className="flex items-start justify-between gap-2">
          {/* 모바일: 케이스 선택 버튼을 응답 칩과 같은 줄 좌측에 배치(데모 컨트롤). */}
          <FloatingCaseSelector caseId={caseId} onSelect={onSelectCase} inline />
          <h1 className="hidden text-sm font-medium text-slate-400 sm:block">추천 시간</h1>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
              {total}명 중 {current.submitted}명 응답
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewCalendar();
              }}
              aria-label="회의 캘린더 보기"
              className="-my-1 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
            >
              <CalendarLineIcon />
            </button>
          </div>
        </div>
        {/* 데스크톱: 인라인 케이스 선택. 모바일은 우하단 플로팅 버튼으로 대체(화면 절약). */}
        <div className="hidden sm:block">
          <CaseSelector caseId={caseId} onSelect={onSelectCase} />
        </div>
        <div className="hidden sm:block">
          <CaseDescription caseId={caseId} />
        </div>

        {/* 맥락형 해석 문장 — modu 가 응답 분포를 해석한 결과를 먼저 말해준다.
            확정은 하지 않는다 — 최종 결정은 참여자들이 제품 밖에서 한다. */}
        <div className="space-y-1 px-1">
          <p className="break-keep text-sm font-bold text-slate-800">{contextual.headline}</p>
          <p className="break-keep text-sm text-slate-600">{contextual.comment}</p>
          <p className="break-keep text-xs text-slate-400">
            이 추천안을 바탕으로 참여자들과 최종 회의 시간을 정해보세요.
          </p>
        </div>

        {/* 특정 시간 검색 — 궁금한 날짜·시간의 참석 가능 여부를 바로 확인(확정/투표 아님). */}
        <AvailabilitySearchBox
          className="px-1"
          dates={dates}
          durationMinutes={durationMinutes}
          participants={snapshot.participants}
          blocks={snapshot.blocks}
          workdayStart={workdayStart}
          workdayEnd={workdayEnd}
          onResult={setSearchResult}
        />
        {searchResult && (
          <div className="rounded-2xl bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.12)]">
            <AvailabilitySearchResultPanel
              result={searchResult}
              onClear={() => setSearchResult(null)}
            />
          </div>
        )}

        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">표시할 추천안이 없어요.</p>
        ) : (
          // 후보 카드는 선택/투표 대상이 아니라 설명 카드 — 왜 이 시간이 좋은지(등급·참석 요약)를 보여준다.
          <div className="space-y-4 py-1">
            {/* 후보 필터 — 그룹별로 나눠 보기(개수 0인 필터는 disabled) */}
            <CandidateFilterChips
              value={candidateFilter}
              counts={filterCounts}
              onChange={setCandidateFilter}
            />
            {visibleCandidateGroups.length === 0 && (
              <p className="px-1 text-sm text-slate-500">이 조건에 해당하는 후보가 없어요.</p>
            )}
            {visibleCandidateGroups.map((group) => (
              <section key={`${caseId}-${group.label}-${group.indexes.join(",")}`}>
                <h2 className="px-1 pb-2 text-xs font-bold text-slate-500">{group.label}</h2>
                <ol className="space-y-2">
                  {group.indexes.map((i) => {
                    const c = candidates[i];
                    return (
                      <li
                        key={`${caseId}-${c.startAt}-${c.endAt}-${i}`}
                        // 위 그룹부터 순서대로 하나씩 페이드인.
                        style={{ animationDelay: `${(cardOrder.get(i) ?? 0) * 120}ms` }}
                        className="relative animate-fade-in rounded-2xl bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.12)] motion-reduce:animate-none"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="font-bold text-slate-900">
                              {formatKoreanDateTimeRange(c.startAt, c.endAt)}
                            </p>
                            <span
                              className={cn(
                                // 2색 체계: 파랑 = 추천, 빨강 = 주의. 앰버는 쓰지 않는다.
                                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                                c.grade === "best"
                                  ? "bg-brand-50 text-brand-700"
                                  : c.grade === "caution"
                                    ? "bg-red-50 text-red-600"
                                    : "bg-slate-100 text-slate-600",
                              )}
                            >
                              {GRADE_LABELS[c.grade]}
                            </span>
                          </div>
                          <p className="mt-1 break-keep text-sm text-slate-500">{c.reason}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* PC 에서도 하단 고정 — 고정 바 안에서 버튼 폭은 본문 컬럼(랜딩 CTA와 동일)과 맞춘다.
          투표 CTA 는 제거 — 캘린더에서 분포와 판단 근거를 확인하는 흐름으로 잇는다. */}
      <MobileStickyAction
        className="mt-6 sm:mt-8"
        stickyDesktop
        innerClassName="sm:max-w-2xl sm:px-6"
      >
        <TDSButton size="xl" display="block" onClick={onViewCalendar}>
          캘린더 보기
        </TDSButton>
      </MobileStickyAction>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

// 추천결과 캘린더(와이드) 셀 톤: 색은 순위가 아니라 신호다.
// 파랑 = 이 후보군에서 가장 나은 시간이 있는 날(필수참석자 전원 가능 후보에만),
// 옅은 빨강 = 이 후보군에서 피하는 게 좋은 날(필수참석자 불가 + 상대적으로 참석 인원이 적은 날),
// 나머지는 중립. 톤 판정은 lib/scheduler/contextualResult 의 calendarMarks 가 한다.
const TONE_CELL: Record<CalendarTone, string> = {
  recommended: "bg-brand-500 font-bold text-white shadow-sm shadow-brand-500/20",
  avoid: "bg-red-100 font-semibold text-red-700",
  none: "text-slate-700 hover:bg-slate-100",
};

// (참석 명단 칩 UI 는 AvailabilitySearchResultPanel 의 NameGroup 으로 통합 —
//  날짜 패널은 DateAvailabilitySummaryPanel 이 담당한다.)

// 주간 보기용: 날짜 범위 전체를 일요일 시작 7일 단위 주(week)로 자른다.
function buildWeeksFromDates(dates: string[]): string[][] {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const { y, m, d } = parseDateStr(first);
  let cursor = addDaysToDateStr(first, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
  const weeks: string[][] = [];
  while (cursor <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysToDateStr(cursor, i)));
    cursor = addDaysToDateStr(cursor, 7);
  }
  return weeks;
}

// 회의 캘린더(done) 화면. (순위 농도 방식의 구버전 SubmittedCalendarScreen 은 삭제 — git 히스토리 참고)
// PC 전용: ① 주간/월간 전환 토글 ② 이 화면만 페이지 폭을 넓게 씀(뷰포트 기준 브레이크아웃)
// ③ 달력 + 명단 패널 2열 배치. 색은 맥락형 해석(contextualResult)의 신호 3톤(파랑/빨강/중립)만 쓴다.
function SubmittedCalendarScreenWide({
  caseId,
  onSelectCase,
  dates,
  durationMinutes,
  workdayStart,
  workdayEnd,
  lunchStart,
  lunchEnd,
  onBack,
}: {
  caseId: number;
  onSelectCase: (id: number) => void;
  dates: string[];
  durationMinutes: number;
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  onBack: () => void;
}) {
  // 데모 단계: 선택한 케이스의 더미 응답으로 달력을 채운다.
  const current = DEMO_CASES.find((c) => c.id === caseId) ?? DEMO_CASES[0];
  const candidates = useMemo(() => buildCaseCandidates(current, dates), [current, dates]);
  const respondedCount = DEMO_PEOPLE.length - current.pendingNames.length;

  // 특정 시간 검색(조회 전용) — 케이스별 더미 응답 스냅샷으로 계산한다.
  const snapshot = useMemo(() => buildCaseSnapshot(current, dates), [current, dates]);
  const [searchResult, setSearchResult] = useState<AvailabilityLookupResult | null>(null);

  const months = useMemo(
    () => getCalendarMonthsWithDates([...dates, ...candidates.map((c) => c.date)]),
    [dates, candidates],
  );
  const monthIndexOf = (dateStr: string) => {
    const [y, m] = dateStr.split("-").map(Number);
    return months.findIndex((mm) => mm.y === y && mm.m === m);
  };
  // 주간 보기: 전체 날짜 범위를 일요일 시작 7일 단위로 자른다.
  const weeks = useMemo(
    () => buildWeeksFromDates([...dates, ...candidates.map((c) => c.date)]),
    [dates, candidates],
  );
  const weekIndexOf = (dateStr: string) => weeks.findIndex((week) => week.includes(dateStr));

  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [selectedDate, setSelectedDate] = useState<string | null>(candidates[0]?.date ?? null);
  const [monthIdx, setMonthIdx] = useState(() =>
    Math.max(0, candidates[0] ? monthIndexOf(candidates[0].date) : 0),
  );
  const [weekIdx, setWeekIdx] = useState(() =>
    Math.max(0, candidates[0] ? weekIndexOf(candidates[0].date) : 0),
  );
  // 케이스가 바뀌면 1순위 날짜를 다시 선택하고 그 달/주로 이동한다(검색 결과도 초기화).
  useEffect(() => {
    const top = candidates[0]?.date ?? null;
    setSelectedDate(top);
    setSearchResult(null);
    if (top) {
      setMonthIdx(Math.max(0, monthIndexOf(top)));
      setWeekIdx(Math.max(0, weekIndexOf(top)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // 검색 성공: 그 날짜가 속한 달/주로 이동하고 선택해, 우측 패널에 검색 결과를 보여준다.
  const handleSearchResult = (result: AvailabilityLookupResult) => {
    setSearchResult(result);
    setSelectedDate(result.date);
    const mIdx = monthIndexOf(result.date);
    if (mIdx >= 0) setMonthIdx(mIdx);
    const wIdx = weekIndexOf(result.date);
    if (wIdx >= 0) setWeekIdx(wIdx);
  };

  const safeMonthIdx = Math.min(Math.max(monthIdx, 0), Math.max(0, months.length - 1));
  const month = months[safeMonthIdx];
  const safeWeekIdx = Math.min(Math.max(weekIdx, 0), Math.max(0, weeks.length - 1));
  const week = weeks[safeWeekIdx];
  // 선택한 날짜 '전체'의 가능 상태 요약 — 대표 후보 시간 하나만 보여주면
  // "이 날은 그 시간만 가능한가?"로 오해할 수 있어 하루 단위로 평가한다.
  const dateSummary = useMemo(
    () =>
      selectedDate
        ? summarizeDateAvailability({
            date: selectedDate,
            durationMinutes,
            workdayStart,
            workdayEnd,
            lunchStart,
            lunchEnd,
            participants: snapshot.participants,
            blocks: snapshot.blocks,
          })
        : null,
    [selectedDate, durationMinutes, workdayStart, workdayEnd, lunchStart, lunchEnd, snapshot],
  );

  // 주간 전환: 선택된 날짜(없으면 1순위)가 속한 주로 이동한다.
  const switchToWeek = () => {
    setViewMode("week");
    const anchor = selectedDate ?? candidates[0]?.date ?? null;
    if (anchor) {
      const idx = weekIndexOf(anchor);
      if (idx >= 0) setWeekIdx(idx);
    }
  };

  const totalPeople = DEMO_PEOPLE.length;
  // 맥락형 해석 — 후보 전체를 평가해 컨텍스트·해석 문장·날짜 톤(신호)을 만든다.
  const contextual = useMemo(
    () => buildContextualScheduleResult(adaptDemoCaseToEvaluatedSlots(current, dates)),
    [current, dates],
  );
  const markByDate = useMemo(() => {
    const map = new Map<string, CalendarMark>();
    contextual.calendarMarks.forEach((mark) => map.set(mark.date, mark));
    return map;
  }, [contextual]);
  // 선택한 날짜가 빨간 날이면 왜 피하는 게 좋은지(mark.reason)를 패널 상단에서 바로 알려준다.
  const selectedMark = selectedDate ? markByDate.get(selectedDate) : undefined;
  // 날짜 셀 공통 계산 — 톤을 정한 대표 슬롯(representativeSlot)을 표시에도 그대로 써서,
  // 하루에 슬롯이 여러 개여도 톤과 숫자/시간이 서로 다른 슬롯에서 오지 않게 한다.
  const cellInfo = (dateStr: string) => {
    const mark = markByDate.get(dateStr);
    const rep = mark?.representativeSlot;
    if (!mark || !rep) return null;
    return {
      tone: mark.tone,
      cellClass: TONE_CELL[mark.tone],
      availCount: rep.totalAvailable,
      startAt: rep.startAt,
      endAt: rep.endAt,
      // 필수 인원이 빠지는 날은 배경 대신 가능 인원 숫자를 빨간색으로(soft 경고).
      warn: rep.requiredBusyCount >= 1,
    };
  };

  const fmtKoMonthDay = (dateStr: string) => {
    const { m, d } = parseDateStr(dateStr);
    return `${m}월 ${d}일`;
  };

  // 월간 달력 카드. 모바일 셀은 원본과 동일한 정사각 숫자, PC 셀은 높이를 키워 순위·시간 요약을 함께 보여준다.
  const monthCard = (extraClassName?: string) =>
    month && (
      <Card className={cn("border-none px-2 sm:px-3", extraClassName)}>
        <CalendarGrid
          month={month}
          canPrev={safeMonthIdx > 0}
          canNext={safeMonthIdx < months.length - 1}
          onPrev={() => setMonthIdx(safeMonthIdx - 1)}
          onNext={() => setMonthIdx(safeMonthIdx + 1)}
          emptyCellPrefix="done-cal-wide"
          renderDate={(cell) => {
            const info = cellInfo(cell.date);
            const isSelected = selectedDate === cell.date;
            return (
              <button
                key={cell.key}
                type="button"
                disabled={!info}
                onClick={() => {
                  setSelectedDate(cell.date);
                  setSearchResult(null); // 날짜를 직접 고르면 검색 결과 대신 그날 명단을 보여준다.
                }}
                aria-pressed={isSelected}
                aria-label={`${month.m}월 ${cell.day}일${
                  info
                    ? `${
                        info.tone === "recommended"
                          ? " — 가장 나은 시간"
                          : info.tone === "avoid"
                            ? " — 피하는 게 좋은 날"
                            : ""
                      }, ${info.availCount}/${totalPeople}명 가능`
                    : ""
                }`}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm leading-none transition motion-reduce:transition-none",
                  "sm:aspect-auto sm:h-24 sm:items-start sm:justify-start sm:gap-1 sm:p-2 sm:text-left sm:leading-tight",
                  !info ? "cursor-default text-slate-300" : info.cellClass,
                  isSelected && "modu-cell-pop z-10",
                )}
              >
                {cell.day}
                {info?.tone === "recommended" && (
                  <span className="hidden text-[11px] font-semibold leading-tight sm:block">
                    {formatKoreanTimeRange(info.startAt, info.endAt)}
                  </span>
                )}
                {info && (
                  <span
                    className={cn(
                      "text-[10px] font-semibold leading-none sm:text-[11px] sm:leading-tight",
                      info.warn
                        ? "rounded-full bg-white/85 px-1 py-px text-red-600"
                        : "opacity-80",
                    )}
                  >
                    {info.availCount}/{totalPeople}
                  </span>
                )}
              </button>
            );
          }}
        />
      </Card>
    );

  // 주간 달력 카드(PC 전용) — 하루가 한 칸을 넓게 써서 시간대와 가능 인원을 함께 보여준다.
  const weekCard = week && (
    <Card className="hidden border-none px-2 sm:block sm:px-3">
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <button
          type="button"
          onClick={() => setWeekIdx(safeWeekIdx - 1)}
          disabled={safeWeekIdx <= 0}
          aria-label="이전 주"
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
        >
          <CalendarChevron dir="left" />
        </button>
        <span className="text-sm font-bold text-slate-800">
          {fmtKoMonthDay(week[0])} ~ {fmtKoMonthDay(week[6])}
        </span>
        <button
          type="button"
          onClick={() => setWeekIdx(safeWeekIdx + 1)}
          disabled={safeWeekIdx >= weeks.length - 1}
          aria-label="다음 주"
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
        >
          <CalendarChevron dir="right" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {CALENDAR_WEEKDAYS.map((weekday, i) => (
          <div
            key={weekday}
            className={cn(
              "py-1 text-xs font-semibold",
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400",
            )}
          >
            {weekday}
          </div>
        ))}
        {week.map((dateStr) => {
          const info = cellInfo(dateStr);
          const isSelected = selectedDate === dateStr;
          const { m, d } = parseDateStr(dateStr);
          return (
            <button
              key={dateStr}
              type="button"
              disabled={!info}
              onClick={() => {
                setSelectedDate(dateStr);
                setSearchResult(null); // 날짜를 직접 고르면 검색 결과 대신 그날 명단을 보여준다.
              }}
              aria-pressed={isSelected}
              aria-label={`${m}월 ${d}일${
                info
                  ? `${
                      info.tone === "recommended"
                        ? " — 가장 나은 시간"
                        : info.tone === "avoid"
                          ? " — 피하는 게 좋은 날"
                          : ""
                    }, ${info.availCount}/${totalPeople}명 가능`
                  : ""
              }`}
              className={cn(
                "relative flex h-32 flex-col items-start gap-1.5 rounded-lg p-2.5 text-left text-sm leading-tight transition motion-reduce:transition-none",
                !info ? "cursor-default text-slate-300" : info.cellClass,
                isSelected && "modu-cell-pop z-10",
              )}
            >
              <span className="text-sm font-bold leading-none">{d}</span>
              {info && (
                <>
                  <span className="text-xs font-semibold">
                    {formatKoreanTimeRange(info.startAt, info.endAt)}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-semibold",
                      info.warn
                        ? "rounded-full bg-white/85 px-1.5 py-0.5 text-red-600"
                        : "opacity-80",
                    )}
                  >
                    {info.availCount}/{totalPeople} 가능
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );

  return (
    // 이 화면만 특별히 넓게: 부모(max-w-2xl)를 뷰포트 기준으로 벗어나 가운데 정렬(PC 전용).
    <div className="space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 sm:relative sm:left-1/2 sm:w-[min(80rem,calc(100vw-4rem))] sm:-translate-x-1/2 sm:pb-8">
      {/* 뒤로가기: 추천 시간(result) 화면으로 — 우상단 추천안 보기 아이콘과 동일 동작 */}
      <MobileHeaderTitle title="회의 캘린더" onBack={onBack} />
      <div className="flex items-center justify-between gap-2">
        <div className="hidden items-center gap-2 sm:flex">
          <Emoji symbol="📅" size={22} />
          <h2 className="text-xl font-extrabold text-slate-900">회의 캘린더</h2>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* 주간/월간 전환 — PC 전용(모바일은 월간 고정) */}
          <div
            role="group"
            aria-label="달력 보기 방식"
            className="hidden items-center rounded-full bg-slate-100 p-0.5 sm:flex"
          >
            <button
              type="button"
              onClick={() => setViewMode("month")}
              aria-pressed={viewMode === "month"}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold transition-colors",
                viewMode === "month"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              월간
            </button>
            <button
              type="button"
              onClick={switchToWeek}
              aria-pressed={viewMode === "week"}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold transition-colors",
                viewMode === "week"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              주간
            </button>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {DEMO_PEOPLE.length}명 중 {respondedCount}명 응답
          </span>
          {/* 추천안으로 돌아가기 — 추천안 화면의 캘린더 버튼과 짝(같은 자리) */}
          <button
            type="button"
            onClick={onBack}
            aria-label="추천안 보기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
          >
            <RankListIcon />
          </button>
        </div>
      </div>

      {/* 데스크톱: 인라인 케이스 선택. 모바일은 우하단 플로팅 버튼으로 대체(화면 절약). */}
      <div className="hidden sm:block">
        <CaseSelector caseId={caseId} onSelect={onSelectCase} />
      </div>
      <div className="hidden sm:block">
        <CaseDescription caseId={caseId} />
      </div>

      {/* 맥락형 해석 문장 — 결과 분포(대부분 가능/보통/바쁨/없음)에 따라 문구가 달라진다.
          캘린더는 최종 확정을 유도하지 않는다 — 결정은 참여자들이 제품 밖에서 한다. */}
      <div className="space-y-1 px-1">
        <p className="break-keep text-sm font-bold text-slate-800">{contextual.headline}</p>
        <p className="break-keep text-sm text-slate-600">{contextual.comment}</p>
        {/* 특정 시간대 경고 — mostlyAvailable 은 첫 경고가 이미 코멘트에 있어 건너뛴다. */}
        {(contextual.context === "mostlyAvailable"
          ? contextual.warnings.slice(1, 3)
          : contextual.warnings.slice(0, 3)
        ).map((warning) => (
          <p
            key={`${warning.startAt}-${warning.level}`}
            className="break-keep text-xs font-medium text-red-500"
          >
            {warning.message}
          </p>
        ))}
        <p className="break-keep text-xs text-slate-400">
          이 추천안을 바탕으로 참여자들과 최종 회의 시간을 정해보세요.
        </p>
      </div>

      {/* 특정 시간 검색 — 성공하면 그 날짜로 이동·선택되고 우측 패널에 결과가 보인다. */}
      <AvailabilitySearchBox
        className="px-1 sm:max-w-sm"
        dates={dates}
        durationMinutes={durationMinutes}
        participants={snapshot.participants}
        blocks={snapshot.blocks}
        workdayStart={workdayStart}
        workdayEnd={workdayEnd}
        onResult={handleSearchResult}
      />

      {/* 범례 — busyPeriod 에선 차선 후보도 파랗게 칠해질 수 있어 '추천'이 아니라 '가장 나은'으로 쓴다. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-slate-500">
        <LegendDot className="bg-brand-500" label="가장 나은 시간" />
        <LegendDot className="bg-red-300" label="피하는 게 좋은 날" />
        <span>숫자는 참석할 수 있는 인원이에요.</span>
        <span className="text-slate-400">날짜를 누르면 참석 명단이 보여요.</span>
      </div>

      {/* PC: 달력(좌) + 참석 명단(우) 2열. 모바일: 원본과 동일한 세로 스택. */}
      <div className="space-y-4 sm:grid sm:grid-cols-[minmax(0,1fr)_24rem] sm:items-start sm:gap-5 sm:space-y-0">
        <div className="space-y-4">
          {viewMode === "week" ? (
            <>
              {weekCard}
              {/* 주간 모드에서도 모바일은 월간 고정 */}
              {monthCard("sm:hidden")}
            </>
          ) : (
            monthCard()
          )}
        </div>

        {/* 선택한 날짜의 참석 명단 패널 — 검색 직후에는 검색한 시간 기준 결과를 우선 보여준다. */}
        <Card className="space-y-3">
          {selectedDate === null ? (
            <p className="text-sm text-slate-500">날짜를 누르면 참석자별 가능 여부를 볼 수 있어요.</p>
          ) : searchResult && searchResult.date === selectedDate ? (
            <AvailabilitySearchResultPanel
              result={searchResult}
              onClear={() => setSearchResult(null)}
            />
          ) : (
            <>
              <p className="text-base font-bold text-slate-900">
                {formatKoreanDateLabel(selectedDate)}
              </p>
              {/* 빨간 날짜를 눌렀을 때 왜 피하는 게 좋은지 명시(상대적 인원 부족 포함) */}
              {selectedMark?.tone === "avoid" && selectedMark.reason && (
                <p className="break-keep rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                  {selectedMark.reason}
                </p>
              )}
              {/* 날짜 전체 요약 — 대표 후보 시간 하나가 아니라 하루 단위 가능 상태를 보여준다. */}
              {dateSummary && <DateAvailabilitySummaryPanel summary={dateSummary} />}
            </>
          )}
        </Card>
      </div>

      <FloatingCaseSelector caseId={caseId} onSelect={onSelectCase} />
    </div>
  );
}
