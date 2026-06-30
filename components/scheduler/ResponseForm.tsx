"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Emoji } from "@/components/ui/Emoji";
import {
  loadCalendarSnapshot,
  loadVotingOptions,
  loadParticipantResponse,
  submitAvailability,
  submitVote,
  verifyParticipantIdentity,
} from "@/app/actions/meetings";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TDSButton } from "@/components/ui/TDSButton";
import { MeetingSummarySentence } from "@/components/meeting/MeetingSummarySentence";
import { MobileStickyAction } from "@/components/layout/MobileStickyAction";
import { cn } from "@/lib/cn";
import { useScrollLock } from "@/lib/useScrollLock";
import { cellKey, cellsToBlocks, GRID_STEP_MINUTES } from "@/lib/grid";
import {
  describeDateStr,
  formatHm,
  formatKoreanDate,
  formatKoreanDateTimeRange,
  formatKoreanTimeRange,
  kstWallToIso,
  parseHm,
} from "@/lib/time";
import { MOCK_EMPLOYEES } from "@/data/mockEmployees";
import type { PublicParticipant } from "@/lib/data";
import type {
  CalendarSnapshotBlock,
  CalendarSnapshotParticipant,
  VoteOption,
} from "@/lib/actionTypes";
import type { AttendanceType, AvailabilityStatus, CellStatus } from "@/lib/types";
import { recommendSlots, GRADE_LABELS, type SlotCandidate } from "@/lib/scheduler";
import {
  DEMO_PEOPLE,
  DEMO_CASES,
  buildCaseCandidates,
  buildCaseSnapshot,
} from "@/data/demoCases";

interface Props {
  meetingId: string;
  meetingTitle: string;
  agenda: string;
  location: string;
  deadlineDate: string;
  durationMinutes: number;
  dates: string[];
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  initialParticipants: PublicParticipant[];
}

type Step = "loading" | "intro" | "identity" | "availability" | "review" | "result" | "done";
type DateSummaryStatus = "available" | "preferred" | "busy" | "mixed";
type CalendarStatus = "available" | "preferred" | "avoid" | "busy" | "pending";

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

function epoch(iso: string) {
  return Date.parse(iso);
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function participantStatusForSlot(
  participant: CalendarSnapshotParticipant,
  blocks: CalendarSnapshotBlock[],
  slotStart: number,
  slotEnd: number,
): CalendarStatus {
  if (participant.responseStatus !== "submitted") return "pending";

  const statuses = blocks
    .filter(
      (block) =>
        block.participantId === participant.id &&
        overlaps(slotStart, slotEnd, epoch(block.startAt), epoch(block.endAt)),
    )
    .map((block) => block.status);

  if (statuses.includes("busy")) return "busy";
  if (statuses.includes("avoid")) return "avoid";
  if (statuses.includes("preferred")) return "preferred";
  return "available";
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
// 긍정(선호)은 파란색, 부정(피하고 싶은/불가/안 되는)은 회색으로 구분한다.
function EditValue({
  fieldLabel,
  onEdit,
  tone = "positive",
  children,
}: {
  fieldLabel: string;
  onEdit: () => void;
  tone?: "positive" | "negative";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${fieldLabel} 수정`}
      className={cn(
        "inline rounded font-semibold decoration-2 underline-offset-4 transition-colors hover:underline focus:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-brand-200",
        tone === "negative"
          ? "text-slate-500 decoration-slate-300 hover:text-slate-600"
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

// 한글 받침 유무(서술격조사 이에요/예요 선택용).
function hasBatchim(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const c = t.charCodeAt(t.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false; // 한글 음절이 아니면 받침 없음으로 처리
  return (c - 0xac00) % 28 !== 0;
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

const CAL_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 월 이동 화살표 아이콘(DatePicker 와 동일 톤).
function CalChevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path
        d={dir === "left" ? "M7.5 3 4.5 6l3 3" : "M4.5 3 7.5 6l-3 3"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 한 번에 한 달만 보여주고 < > 로 월을 이동하는 달력(유효 날짜가 있는 월 범위 안에서만).
function MonthCalendar({
  dates,
  selected,
  onToggle,
  tone,
  blockedDates,
}: {
  dates: string[];
  selected: Set<string>;
  onToggle: (ds: string) => void;
  tone: "busy" | "pref";
  blockedDates?: Set<string>;
}) {
  const validSet = new Set(dates);
  // 유효 날짜가 들어있는 월 목록(정렬). 이 안에서만 이동한다.
  const months = useMemo(() => {
    const map = new Map<string, { y: number; m: number }>();
    for (const ds of dates) {
      const [y, m] = ds.split("-").map(Number);
      map.set(`${y}-${m}`, { y, m });
    }
    return Array.from(map.values()).sort((a, b) => a.y - b.y || a.m - b.m);
  }, [dates]);

  const [monthIdx, setMonthIdx] = useState(0);
  const safeIdx = months.length === 0 ? 0 : Math.min(monthIdx, months.length - 1);
  const cur = months[safeIdx];

  const selStyle =
    tone === "busy"
      ? "border-red-300 bg-red-100 text-red-700"
      : "border-blue-300 bg-blue-100 text-blue-700";

  if (!cur) return null;

  const { y, m } = cur;
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const grid: (number | null)[] = [];
  for (let i = 0; i < lead; i += 1) grid.push(null);
  for (let d = 1; d <= daysIn; d += 1) grid.push(d);

  return (
    <div className="w-full max-w-[18rem]">
      {/* 월 이동 헤더 */}
      <div className="mb-1.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthIdx(safeIdx - 1)}
          disabled={safeIdx === 0}
          aria-label="이전 달"
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
        >
          <CalChevron dir="left" />
        </button>
        <span className="text-sm font-bold text-slate-700">
          {y}년 {m}월
        </span>
        <button
          type="button"
          onClick={() => setMonthIdx(safeIdx + 1)}
          disabled={safeIdx === months.length - 1}
          aria-label="다음 달"
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
        >
          <CalChevron dir="right" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {CAL_WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={cn(
              "py-0.5 text-xs font-bold",
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400",
            )}
          >
            {w}
          </span>
        ))}
        {grid.map((d, i) => {
          if (d == null) return <span key={`b${i}`} />;
          const ds = `${y}-${pad2(m)}-${pad2(d)}`;
          const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
          const isWeekend = dow === 0 || dow === 6;
          const blocked = blockedDates?.has(ds) ?? false;
          const inRange = validSet.has(ds) && !isWeekend;
          const enabled = inRange && !blocked;
          const isSel = selected.has(ds);
          return (
            <button
              key={ds}
              type="button"
              disabled={!enabled}
              onClick={() => onToggle(ds)}
              aria-pressed={isSel}
              aria-label={blocked ? `${m}월 ${d}일 — 불가능한 날짜` : undefined}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm font-semibold leading-none transition-colors",
                blocked
                  ? "cursor-not-allowed border-red-200 bg-red-50 text-red-400"
                  : !inRange
                    ? "cursor-not-allowed border-transparent text-slate-300"
                    : isSel
                      ? selStyle
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              <span className={cn(blocked && "line-through")}>{d}</span>
              {blocked && (
                <span className="mt-0.5 text-[8px] font-bold leading-none text-red-500">
                  불가
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
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
  const pick = (min: number) => {
    if (!inWork(min)) {
      setPending(min);
      return;
    }
    onChange(minToHm(min));
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-3 py-4 sm:items-center sm:py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="w-full max-w-[20rem] overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-2xl sm:max-w-[22rem]"
      >
        {pending !== null ? (
          <div className="p-5">
            <p className="text-base font-bold text-slate-900">{formatClock(pending)}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              선택한 시간은 근무시간({formatClock(workStart)}~{formatClock(workEnd)})을 벗어났습니다.
              그래도 선택하시겠습니까?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmPending}
                className="flex-1 rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600"
              >
                선택
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-bold text-slate-900">{ariaLabel}</p>
              <button
                type="button"
                onClick={close}
                aria-label="닫기"
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Emoji symbol="✕" size={20} />
              </button>
            </div>
            <div ref={listRef} className="max-h-[18rem] overflow-y-auto py-1">
              {ALL_TIME_OPTIONS.map((min) => {
                const work = inWork(min);
                const isSel = min === valueMin;
                return (
                  <button
                    key={min}
                    type="button"
                    data-sel={isSel}
                    onClick={() => pick(min)}
                    className={cn(
                      "flex w-full items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-slate-50",
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
  useScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const list = [...selected].sort();
  const chipTone =
    tone === "busy" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700";

  const dialog = open ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-3 py-4 sm:px-4 sm:py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-[20rem] overflow-y-auto rounded-[22px] border border-slate-200 bg-white p-3 shadow-2xl sm:max-w-[22rem] sm:p-4"
      >
        <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
          <div>
            <p className="text-sm font-bold text-slate-900">{title}</p>
            <p className="mt-0.5 text-xs text-slate-400">여러 날짜를 선택할 수 있어요</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="달력 닫기"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <Emoji symbol="✕" size={20} />
          </button>
        </div>
        <div className="flex justify-center">
          <MonthCalendar
            dates={dates}
            selected={selected}
            onToggle={onToggle}
            tone={tone}
            blockedDates={blockedDates}
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-3 w-full rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600"
        >
          완료
        </button>
      </div>
    </div>
  ) : null;

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
      {dialog ? createPortal(dialog, document.body) : null}
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
  const [draftStart, setDraftStart] = useState(workdayStart);
  const [draftEnd, setDraftEnd] = useState(workdayEnd);
  // 복사완료 토스트처럼 요소는 계속 렌더되고 open 클래스만 토글해 등장/사라짐을 전환한다.
  // (사라지는 동안 message 를 유지해야 텍스트가 즉시 사라지지 않고 부드럽게 페이드아웃된다.)
  const [toastMessage, setToastMessage] = useState("");
  const [toastIcon, setToastIcon] = useState("⚠️");
  const [toastOpen, setToastOpen] = useState(false);
  const toastTimer = useRef<number | null>(null);

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
    const raw = window.localStorage.getItem(storageKey(meetingId));
    if (!raw) {
      setStep("intro");
      return;
    }
    let parsed: { participantId?: string; token?: string } | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!parsed?.participantId || !parsed.token) {
      setStep("intro");
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
          setStep("result");
        } else {
          window.localStorage.removeItem(storageKey(meetingId));
          setSelectedId(null);
          setToken(null);
          setStep("intro");
        }
      })
      .catch(() => setStep("intro"));
    // 최초 1회만 실행.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const renderTimeAdder = (ranges: TimeRange[], onRemove: (i: number) => void) => (
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
      {ranges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ranges.map((r, i) => (
            <span
              key={`${r.start}-${r.end}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700"
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
    setStep("result");
  }

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
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-400">회의 안내</p>
          <MeetingSummarySentence
            className="mt-3"
            title={meetingTitle}
            agenda={agenda}
            location={location}
            deadlineDate={deadlineDate}
            durationMinutes={durationMinutes}
          />
        </div>
        <MobileStickyAction className="mt-8">
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
        </MobileStickyAction>
      </div>
    );
  }

  // 입력 최종 확인 화면 → '다음' 으로 제출.
  if (step === "review") {
    const busyDatesText =
      busyDates.size > 0 ? [...busyDates].sort().map(fmtMD).join(", ") : null;
    const dtText =
      Object.keys(dateTimeBusy).length > 0
        ? Object.entries(dateTimeBusy)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([ds, rs]) => `${fmtMD(ds)} ${rs.map(fmtRange).join("·")}`)
            .join(", ")
        : null;
    return (
      <>
        <Toast open={toastOpen} message={toastMessage} icon={toastIcon} />
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-400">입력 확인</p>
            <div className="mt-3 break-keep text-left text-xl leading-relaxed text-slate-800 sm:text-2xl sm:leading-relaxed">
              저는{" "}
              {busyDatesText ? (
                <>
                  <EditValue
                    fieldLabel="불가능한 날짜"
                    tone="negative"
                    onEdit={() => {
                      setAvailStep(0);
                      setStep("availability");
                    }}
                  >
                    {busyDatesText}
                  </EditValue>
                  에는 회의가 불가능하고,{" "}
                </>
              ) : (
                <EditValue
                  fieldLabel="불가능한 날짜"
                  tone="negative"
                  onEdit={() => {
                    setAvailStep(0);
                    setStep("availability");
                  }}
                >
                  불가능한 날짜는 없고,
                </EditValue>
              )}{" "}
              {dtText ? (
                <>
                  특별히{" "}
                  <EditValue
                    fieldLabel="특정 날짜 시간"
                    tone="negative"
                    onEdit={() => {
                      setAvailStep(1);
                      setStep("availability");
                    }}
                  >
                    {dtText}
                  </EditValue>
                  에는 안 돼요.
                </>
              ) : (
                <EditValue
                  fieldLabel="특정 날짜 시간"
                  tone="negative"
                  onEdit={() => {
                    setAvailStep(1);
                    setStep("availability");
                  }}
                >
                  특정 시간에 안 되는 날은 없어요.
                </EditValue>
              )}
            </div>
            <p className="mt-5 text-sm text-slate-500">
              이대로 제출할까요? 제출 후에도 수정할 수 있어요.
            </p>
          </div>
          <MobileStickyAction className="mt-auto">
            <div className="space-y-2">
              <TDSButton
                size="xl"
                display="block"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                loading={submitting}
              >
                {submitting ? "제출 중..." : "다음"}
              </TDSButton>
              <TDSButton
                size="xl"
                tone="secondary"
                display="block"
                onClick={() => {
                  setAvailStep(0);
                  setStep("availability");
                }}
              >
                수정하기
              </TDSButton>
            </div>
          </MobileStickyAction>
        </div>
      </>
    );
  }

  // 제출 후 결과 화면 — 응답 현황 + 현재 후보 순위. 캘린더는 버튼으로 이동.
  if (step === "result") {
    return (
      <ResultScreen
        caseId={caseId}
        onSelectCase={setCaseId}
        dates={dates}
        onViewCalendar={() => setStep("done")}
        onEdit={() => {
          setAvailStep(0);
          setMaxAvailStep(0);
          setStep("availability");
        }}
      />
    );
  }

  if (step === "done") {
    return (
      <SubmittedCalendarScreen
        caseId={caseId}
        onSelectCase={setCaseId}
        dates={dates}
        rows={rows}
        onBack={() => setStep("result")}
        onEdit={() => {
          // 본인은 이미 확인됨 → 가능 시간 화면 처음부터 다시.
          setAvailStep(0);
          setMaxAvailStep(0);
          setStep("availability");
        }}
      />
    );
  }

  // step === "identity": 본인확인(이름 → 직무) 문장 빌더.
  if (step === "identity") {
    return (
      <>
        <Toast open={toastOpen} message={toastMessage} icon={toastIcon} />
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-400">본인 확인</p>
            <div
              aria-live="polite"
              className="mt-3 break-keep text-left text-2xl leading-relaxed text-slate-800 sm:text-3xl sm:leading-relaxed"
            >
              <p>
                {clauseVisible(0) && (
                  <span className="animate-fade-in motion-reduce:animate-none">
                    저는{" "}
                    {valueSlot(identityName.trim() === "", "이름", () => editFormStep(0), identityName)}
                    이고,{" "}
                  </span>
                )}
                {clauseVisible(1) && (
                  <span className="animate-fade-in motion-reduce:animate-none">
                    직무는{" "}
                    {valueSlot(identityRole.trim() === "", "직무", () => editFormStep(1), identityRole)}
                    {hasBatchim(identityRole) ? "이에요." : "예요."}
                  </span>
                )}
              </p>
            </div>
          </div>

          <MobileStickyAction className="mt-8">
            <div key={formStep} className="animate-fade-up motion-reduce:animate-none">
              {formStep === 0 ? (
                <>
                  <Label htmlFor="pName" className="text-lg">이름을 입력해주세요</Label>
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
                  <Label htmlFor="pRole" className="text-lg">직무를 선택해주세요</Label>
                  <Select
                    id="pRole"
                    value={identityRole}
                    onChange={(e) => setIdentityRole(e.target.value)}
                  >
                    <option value="">직무 선택</option>
                    {roleOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
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
        {/* 상단: 답변이 쌓이는 문장 */}
        <p className="pt-2 text-sm font-medium text-slate-400">가능 시간</p>
        <div
          aria-live="polite"
          className="mt-3 break-keep text-left text-xl leading-relaxed text-slate-800 sm:text-2xl sm:leading-relaxed"
        >
          {availClauseVisible(0) && (
            <span className="animate-fade-in motion-reduce:animate-none">
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
            <span className="animate-fade-in motion-reduce:animate-none">
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

        {/* 질문 + 단계별 입력 */}
        <div key={availStep} className="mt-6 animate-fade-up motion-reduce:animate-none">
          <p className="text-lg font-bold text-slate-800">{AVAIL_QUESTIONS[availStep]}</p>
          <div className="mt-3">
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
                {/* 날짜 선택 트리거 → 모달(불가능으로 고른 날짜는 차단) */}
                <button
                  type="button"
                  onClick={() => setDtModalOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={dtModalOpen}
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 transition-colors hover:border-slate-400 focus:border-2 focus:border-brand-400 focus:outline-none focus:ring-0"
                >
                  <span className={dtDate ? "" : "text-slate-400"}>
                    {dtDate ? `${fmtMD(dtDate)} 시간 입력 중` : "날짜 선택"}
                  </span>
                  <Emoji symbol="📅" size={16} />
                </button>

                {dtModalOpen &&
                  createPortal(
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-3 py-4 sm:px-4 sm:py-6"
                      onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setDtModalOpen(false);
                      }}
                    >
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="특정 날짜 선택"
                        className="max-h-[calc(100dvh-2rem)] w-full max-w-[20rem] overflow-y-auto rounded-[22px] border border-slate-200 bg-white p-3 shadow-2xl sm:max-w-[22rem] sm:p-4"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">특정 시간이 안 되는 날</p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              불가능으로 고른 날은 선택할 수 없어요
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDtModalOpen(false)}
                            aria-label="달력 닫기"
                            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Emoji symbol="✕" size={20} />
                          </button>
                        </div>
                        <div className="flex justify-center">
                          <MonthCalendar
                            dates={dates}
                            selected={new Set([...Object.keys(dateTimeBusy), ...(dtDate ? [dtDate] : [])])}
                            onToggle={(ds) => {
                              setDtDate(ds);
                              setDtModalOpen(false);
                            }}
                            tone="busy"
                            blockedDates={busyDates}
                          />
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )}

                {dtDate && (
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-sm font-bold text-slate-700">{fmtMD(dtDate)} 안 되는 시간</p>
                    <div className="mt-2">
                      {renderTimeAdder(dateTimeBusy[dtDate] ?? [], (i) => removeRange(i, dtDate))}
                    </div>
                  </div>
                )}

                {/* 이미 시간을 입력한 다른 날짜로 빠른 전환 */}
                {Object.keys(dateTimeBusy).filter((ds) => ds !== dtDate).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(dateTimeBusy)
                      .filter((ds) => ds !== dtDate)
                      .sort()
                      .map((ds) => (
                        <button
                          key={ds}
                          type="button"
                          onClick={() => setDtDate(ds)}
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700"
                        >
                          {fmtMD(ds)} ({dateTimeBusy[ds].length})
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* 하단 고정 CTA */}
        <MobileStickyAction className="mt-auto">
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
      <p className="text-xs font-bold text-slate-400">케이스 선택</p>
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
            current.banner.tone === "danger"
              ? "bg-red-50 text-red-700"
              : current.banner.tone === "caution"
                ? "bg-amber-50 text-amber-700"
                : "bg-brand-50 text-brand-700",
          )}
        >
          {current.banner.text}
        </p>
      )}
    </div>
  );
}

// 제출 후 결과 화면: 케이스별 응답 현황 + 후보 순위(더미). 캘린더는 '캘린더 보기'로 이동.
function ResultScreen({
  caseId,
  onSelectCase,
  dates,
  onViewCalendar,
  onEdit,
}: {
  caseId: number;
  onSelectCase: (id: number) => void;
  dates: string[];
  onViewCalendar: () => void;
  onEdit: () => void;
}) {
  const current = DEMO_CASES.find((c) => c.id === caseId) ?? DEMO_CASES[0];
  const candidates = useMemo(() => buildCaseCandidates(current, dates), [current, dates]);
  const total = DEMO_PEOPLE.length;
  // 데모: 한 번에 한 후보에만 투표. 다른 후보에 투표하면 벳지가 이동한다.
  const [votedIndex, setVotedIndex] = useState<number | null>(null);
  // 케이스를 바꾸면 후보가 달라지므로 투표 상태를 초기화한다.
  useEffect(() => {
    setVotedIndex(null);
  }, [caseId]);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col pt-2">
      {/* 고정: 진행 현황 + 케이스 버튼 */}
      <div className="shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">후보</h1>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {total}명 중 {current.submitted}명 응답
          </span>
        </div>
        <CaseSelector caseId={caseId} onSelect={onSelectCase} />
      </div>

      {/* 스크롤: 케이스 설명 + 후보 카드 */}
      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pb-1">
        <CaseDescription caseId={caseId} />
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">표시할 후보가 없어요.</p>
        ) : (
          <ol className="space-y-2">
            {candidates.map((c, i) => (
              <li
                key={`${c.startAt}-${c.endAt}-${i}`}
                className="group relative rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:bg-slate-100"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-bold text-slate-900">
                        {formatKoreanDateTimeRange(c.startAt, c.endAt)}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                          c.grade === "best"
                            ? "bg-brand-50 text-brand-700"
                            : c.grade === "caution"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {GRADE_LABELS[c.grade]}
                      </span>
                      {c.votes != null && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {c.votes}표
                        </span>
                      )}
                      {votedIndex === i && (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                          투표됨
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-keep text-sm text-slate-500">{c.reason}</p>
                  </div>
                </div>
                {/* 호버 시 우측 가운데에 투표하기 버튼 — 누르면 이 후보로 투표(벳지 이동) */}
                {votedIndex !== i && (
                  <button
                    type="button"
                    onClick={() => setVotedIndex(i)}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white opacity-0 transition-opacity duration-150 hover:bg-brand-600 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                  >
                    투표하기
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* 고정 하단 CTA */}
      <div className="shrink-0 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-2">
        <div className="space-y-2">
          <TDSButton size="xl" display="block" onClick={onViewCalendar}>
            캘린더 보기
          </TDSButton>
          <TDSButton size="xl" tone="secondary" display="block" onClick={onEdit}>
            응답 수정하기
          </TDSButton>
        </div>
      </div>
    </div>
  );
}

// 참석자별 이름 칩 색상 (사람마다 다르게).
const PERSON_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-cyan-100 text-cyan-700",
];

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

// 가능/불가능 상태로 참석자 이름 pill 들을 한 번 더 감싸는 그룹.
function StatusGroup({
  tone,
  label,
  people,
}: {
  tone: "green" | "red";
  label: string;
  people: { name: string; colorClass: string }[];
}) {
  const box = tone === "green" ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50";
  const head = tone === "green" ? "text-green-700" : "text-red-700";
  return (
    <div className={cn("rounded-lg border p-1", box)}>
      <p className={cn("mb-1 px-0.5 text-[10px] font-bold", head)}>
        {label} {people.length}
      </p>
      <div className="flex flex-wrap gap-1">
        {people.map((p) => (
          <span
            key={p.name}
            className={cn(
              "max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold",
              p.colorClass,
            )}
          >
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function SubmittedCalendarScreen({
  caseId,
  onSelectCase,
  dates,
  rows,
  onBack,
  onEdit,
}: {
  caseId: number;
  onSelectCase: (id: number) => void;
  dates: string[];
  rows: number[];
  onBack: () => void;
  onEdit: () => void;
}) {
  // 데모 단계: 선택한 케이스의 더미 응답으로 캘린더를 채운다.
  const current = DEMO_CASES.find((c) => c.id === caseId) ?? DEMO_CASES[0];
  const { participants, blocks } = useMemo(
    () => buildCaseSnapshot(current, dates),
    [current, dates],
  );
  const respondedCount = participants.filter((p) => p.responseStatus === "submitted").length;

  // 마우스로 잡고 끌어 가로 스크롤.
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0 });

  function onDragStart(e: ReactMouseEvent) {
    if (!scrollRef.current) return;
    drag.current = {
      active: true,
      startX: e.pageX,
      startScroll: scrollRef.current.scrollLeft,
    };
  }
  function onDragMove(e: ReactMouseEvent) {
    if (!drag.current.active || !scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollLeft = drag.current.startScroll - (e.pageX - drag.current.startX);
  }
  function onDragEnd() {
    drag.current.active = false;
  }

  // 마우스 휠(세로)을 가로 스크롤로 변환한다.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Emoji symbol="📅" size={22} />
          <h2 className="text-xl font-extrabold text-slate-900">회의 캘린더</h2>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
          {DEMO_PEOPLE.length}명 중 {respondedCount}명 응답
        </span>
      </div>

      <CaseSelector caseId={caseId} onSelect={onSelectCase} />
      <CaseDescription caseId={caseId} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-slate-500">
        <LegendDot className="bg-red-400" label="불가능" />
        <span className="text-slate-400">칸 안의 이름 색은 참석자별로 달라요. (불가능 시간만 표시)</span>
      </div>

      {/* 일주일 그리드 — 마우스로 잡고 끌어 가로 스크롤 */}
      <Card className="overflow-hidden p-0">
        <div
          ref={scrollRef}
          onMouseDown={onDragStart}
          onMouseMove={onDragMove}
          onMouseUp={onDragEnd}
          onMouseLeave={onDragEnd}
          className="cursor-grab select-none overflow-x-auto active:cursor-grabbing"
        >
          <div className="w-max">
            {/* 날짜 헤더 행 */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <div className="sticky left-0 z-10 w-16 shrink-0 border-r border-slate-200 bg-slate-50 px-2 py-2 text-[11px] font-semibold text-slate-400">
                KST
              </div>
              {dates.map((date) => {
                const { weekdayKo, monthDay } = describeDateStr(date);
                return (
                  <div
                    key={date}
                    className="w-52 shrink-0 border-r border-slate-200 px-3 py-2 last:border-r-0"
                  >
                    <p className="text-sm font-bold text-slate-900">{monthDay}</p>
                    <p className="text-xs text-slate-500">{weekdayKo}요일</p>
                  </div>
                );
              })}
            </div>

            {/* 시간 행 — 모든 칸 동일한 최소 높이 */}
            {rows.map((minute) => (
              <div
                key={minute}
                className="flex min-h-[3.5rem] border-b border-slate-100 last:border-b-0"
              >
                <div className="sticky left-0 z-10 w-16 shrink-0 border-r border-slate-200 bg-white px-2 py-1.5 text-right text-[11px] font-medium tabular-nums text-slate-400">
                  {minute % 60 === 0 ? formatHm(minute) : ""}
                </div>
                {dates.map((date) => {
                  const slotStart = epoch(kstWallToIso(date, minute));
                  const slotEnd = epoch(kstWallToIso(date, minute + GRID_STEP_MINUTES));
                  const evaluated = participants.map((p, idx) => ({
                    name: p.name,
                    colorClass: PERSON_COLORS[idx % PERSON_COLORS.length],
                    status: participantStatusForSlot(p, blocks, slotStart, slotEnd),
                  }));
                  const busy = evaluated.filter((e) => e.status === "busy");
                  return (
                    <div
                      key={date}
                      className="w-52 shrink-0 space-y-1 border-r border-slate-100 p-1.5 last:border-r-0"
                    >
                      {busy.length > 0 && (
                        <StatusGroup tone="red" label="불가능" people={busy} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-2">
        <TDSButton
          type="button"
          size="xl"
          tone="secondary"
          display="block"
          className="flex-1"
          onClick={onBack}
        >
          후보 보기
        </TDSButton>
        <TDSButton
          type="button"
          size="xl"
          tone="secondary"
          display="block"
          className="flex-1"
          onClick={onEdit}
        >
          응답 수정
        </TDSButton>
      </div>
    </div>
  );
}

function VotingPanel({
  meetingId,
  participantId,
  token,
}: {
  meetingId: string;
  participantId: string;
  token: string;
}) {
  const [options, setOptions] = useState<VoteOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [votingKey, setVotingKey] = useState<string | null>(null);

  async function load() {
    const res = await loadVotingOptions({ meetingId, participantId, token });
    if (!res.ok) {
      setError(res.error);
      setOptions([]);
      return;
    }
    setError(null);
    setOptions(res.options);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, participantId, token]);

  async function vote(option: VoteOption) {
    const key = `${option.startAt}|${option.endAt}`;
    setVotingKey(key);
    setError(null);
    const res = await submitVote({
      meetingId,
      participantId,
      token,
      startAt: option.startAt,
      endAt: option.endAt,
    });
    setVotingKey(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  }

  if (options === null) {
    return <p className="text-sm text-slate-500">후보 시간대를 불러오는 중...</p>;
  }

  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        <p>{error ?? "아직 투표할 수 있는 후보 시간대가 없어요."}</p>
        <TDSButton
          type="button"
          size="sm"
          tone="secondary"
          className="mt-2"
          onClick={() => void load()}
        >
          후보 다시 확인
        </TDSButton>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-left">
      {options.map((option) => {
        const key = `${option.startAt}|${option.endAt}`;
        const selected = option.userSelected;
        return (
          <button
            key={key}
            type="button"
            onClick={() => vote(option)}
            disabled={votingKey !== null}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60",
              selected
                ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300"
                : "border-slate-200 bg-white hover:bg-slate-50",
            )}
          >
            <span className="block text-xs font-semibold text-slate-500">
              {formatKoreanDate(option.startAt)}
            </span>
            <span className="mt-1 flex items-center justify-between gap-2">
              <span className="text-base font-bold text-slate-900">
                {formatKoreanTimeRange(option.startAt, option.endAt)}
              </span>
              <Badge tone={selected ? "brand" : "gray"}>
                {selected ? "내 투표" : `${option.voteCount}표`}
              </Badge>
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-slate-600">
              {option.reason}
            </span>
          </button>
        );
      })}
      {error && (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
