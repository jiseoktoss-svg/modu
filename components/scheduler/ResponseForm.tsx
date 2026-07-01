"use client";

import {
  useEffect,
  useId,
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
import { CalendarModal } from "@/components/scheduler/CalendarModal";
import { MobileStickyAction } from "@/components/layout/MobileStickyAction";
import { cn } from "@/lib/cn";
import { useScrollLock } from "@/lib/useScrollLock";
import { cellKey, cellsToBlocks, GRID_STEP_MINUTES } from "@/lib/grid";
import {
  describeDateStr,
  formatHm,
  formatKoreanDate,
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
  responseDeadline?: string | null;
  durationMinutes: number;
  dates: string[];
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  initialParticipants: PublicParticipant[];
}

type Step =
  | "loading"
  | "intro"
  | "identity"
  | "availability"
  | "review"
  | "waiting"
  | "result"
  | "done";
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
                선택한 시간은 근무시간({formatClock(workStart)}~{formatClock(workEnd)})을 벗어났습니다.
                그래도 선택하시겠습니까?
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
          setStep("waiting");
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
    showToast("안 되는 시간을 추가했어요", "✅");
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
            className="relative mt-3 animate-fade-up-blur motion-reduce:animate-none"
            title={meetingTitle}
            agenda={agenda}
            location={location}
            deadlineDate={deadlineDate}
            responseDeadline={responseDeadline}
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
            <div className="mt-3 break-keep text-left text-2xl leading-relaxed text-slate-800 sm:text-3xl sm:leading-relaxed">
              {personName}님은{" "}
              {busyDatesText ? (
                <>
                  <EditValue
                    fieldLabel="불가능한 날짜"
                    tone="negative"
                    withShine
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
                    withShine
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
              응답 시간 마감 전까지 수정할 수 있어요. 수정하려면 키워드를 눌러 응답화면으로 이동하세요.
            </p>
          </div>
          <MobileStickyAction className="mt-auto">
            <TDSButton
              size="xl"
              display="block"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              loading={submitting}
            >
              {submitting ? "제출 중..." : "다음"}
            </TDSButton>
          </MobileStickyAction>
        </div>
      </>
    );
  }

  // 제출 후 대기 화면 — 응답 마감 시각까지 기다린 뒤 후보/캘린더로 이동.
  if (step === "waiting") {
    return (
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
                    <label htmlFor="pName" className="text-lg font-semibold text-slate-700">
                      이름을 입력해주세요
                    </label>
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
                  <Label htmlFor="pRole" className="text-lg">직무를 선택해주세요</Label>
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
        {/* 상단: 답변이 쌓이는 문장 */}
        <p className="pt-2 text-sm font-medium text-slate-400">가능 시간</p>
        <div
          aria-live="polite"
          className="mt-3 break-keep text-left text-2xl leading-relaxed text-slate-800 sm:text-3xl sm:leading-relaxed"
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

                {/* 입력한 '이 날 이 시간' 요약 — 탭하면 시트에서 수정, ✕ 로 그 날 전체 삭제 */}
                {Object.keys(dateTimeBusy).length > 0 && (
                  <div className="space-y-1.5">
                    {Object.entries(dateTimeBusy)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([ds, ranges]) => (
                        <div
                          key={ds}
                          className="flex items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => (isMobile ? openDtEdit(ds) : setDtDate(ds))}
                            className="min-w-0 flex-1 text-left text-sm"
                          >
                            <span className="font-bold text-red-800">{fmtMD(ds)}</span>{" "}
                            <span className="break-keep font-semibold text-red-600">
                              {ranges.map(fmtRange).join(", ")}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeWholeDate(ds)}
                            aria-label={`${fmtMD(ds)} 삭제`}
                            className="shrink-0 text-red-500 opacity-70 transition-opacity hover:opacity-100"
                          >
                            <ChipRemoveIcon />
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {/* 데스크톱: 날짜 모달을 닫은 뒤 페이지에서 그 날의 안 되는 시간을 입력(이전 방식) */}
                {!isMobile && dtDate && (
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-sm font-bold text-slate-700">{fmtMD(dtDate)} 안 되는 시간</p>
                    <div className="mt-2">
                      {renderTimeAdder(dateTimeBusy[dtDate] ?? [], (i) => removeRange(i, dtDate))}
                    </div>
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
                    extra={
                      isMobile ? (
                        <div className="space-y-3">
                          {dtDate ? (
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-sm font-bold text-slate-700">
                                {fmtMD(dtDate)} 안 되는 시간
                              </p>
                              <div className="mt-2">
                                {renderTimeAdder(dateTimeBusy[dtDate] ?? [], (i) => removeRange(i, dtDate))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-center text-xs text-slate-400">
                              날짜를 고르면 안 되는 시간을 추가할 수 있어요.
                            </p>
                          )}

                          {/* 지금까지 추가한 모든 날짜의 안 되는 시간 — 다른 날짜를 골라도 계속 보이게([F4]) */}
                          {Object.keys(dateTimeBusy).length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-slate-500">지금까지 추가한 안 되는 시간</p>
                              {Object.entries(dateTimeBusy)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([ds, ranges]) => (
                                  <div
                                    key={ds}
                                    className={cn(
                                      "flex items-center justify-between gap-2 rounded-xl border px-3 py-2",
                                      ds === dtDate
                                        ? "border-red-300 bg-red-100"
                                        : "border-red-100 bg-red-50",
                                    )}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setDtDate(ds)}
                                      className="min-w-0 flex-1 text-left text-sm"
                                    >
                                      <span className="font-bold text-red-800">{fmtMD(ds)}</span>{" "}
                                      <span className="break-keep font-semibold text-red-600">
                                        {ranges.map(fmtRange).join(", ")}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeWholeDate(ds)}
                                      aria-label={`${fmtMD(ds)} 삭제`}
                                      className="shrink-0 text-red-500 opacity-70 transition-opacity hover:opacity-100"
                                    >
                                      <ChipRemoveIcon />
                                    </button>
                                  </div>
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
        { state: "current", label: "추천시간을 확인해보세요" },
      ]
    : [
        { state: "done", label: "내 가능한 시간을 보냈어요" },
        { state: "current", label: "다른 참여자들의 응답을 기다리고 있어요" },
        { state: "todo", label: "추천시간을 확인해보세요" },
      ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col pt-2">
      <div className="flex-1">
        <div className="relative animate-fade-up-blur" style={{ animationDuration: "0.6s" }}>
          <p className="text-sm font-medium text-slate-400">응답 완료</p>
          <h1 className="mt-3 break-keep text-2xl font-extrabold leading-snug tracking-tight text-slate-900 sm:text-3xl sm:leading-snug">
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

function ResultScreen({
  caseId,
  onSelectCase,
  dates,
  onViewCalendar,
}: {
  caseId: number;
  onSelectCase: (id: number) => void;
  dates: string[];
  onViewCalendar: () => void;
}) {
  const current = DEMO_CASES.find((c) => c.id === caseId) ?? DEMO_CASES[0];
  const candidates = useMemo(() => buildCaseCandidates(current, dates), [current, dates]);
  const total = DEMO_PEOPLE.length;
  // 데모: 한 번에 한 후보에만 투표. 다른 후보에 투표하면 벳지가 이동한다.
  const [votedIndex, setVotedIndex] = useState<number | null>(null);
  // 선택된 추천안 — 선택 시 하단에서 '투표하기' 버튼이 올라와 '캘린더 보기'를 덮는다.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // 케이스를 바꾸면 후보가 달라지므로 선택/투표 상태를 초기화한다.
  useEffect(() => {
    setVotedIndex(null);
    setSelectedIndex(null);
  }, [caseId]);

  const handleVote = () => {
    if (selectedIndex === null) return;
    setVotedIndex(selectedIndex);
    setSelectedIndex(null);
  };

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col pt-2"
      onClick={() => setSelectedIndex(null)}
    >
      <div className="flex-1 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">추천안</h1>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {total}명 중 {current.submitted}명 응답
          </span>
        </div>
        <CaseSelector caseId={caseId} onSelect={onSelectCase} />
        <CaseDescription caseId={caseId} />
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">표시할 추천안이 없어요.</p>
        ) : (
          <ol className="space-y-2">
            {candidates.map((c, i) => (
              <li
                key={`${c.startAt}-${c.endAt}-${i}`}
                role="button"
                tabIndex={0}
                aria-pressed={selectedIndex === i}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex((prev) => (prev === i ? null : i));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedIndex((prev) => (prev === i ? null : i));
                  }
                }}
                className={cn(
                  "group relative cursor-pointer rounded-2xl bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.12)] transition-colors hover:bg-slate-100 focus:outline-none",
                  selectedIndex === i
                    ? "ring-2 ring-brand-500"
                    : "focus-visible:ring-2 focus-visible:ring-brand-300",
                )}
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
              </li>
            ))}
          </ol>
        )}
      </div>

      <MobileStickyAction className="mt-4">
        {/* 캘린더 보기 ↔ 투표하기 세로 스왑: 캘린더 보기는 아래로 내려가고, 투표하기는 위로 올라온다.
            두 버튼 모두 brand 블루라 교차 중 생기는 빈틈은 컨테이너 배경(brand-500)으로 가린다. */}
        <div className="relative overflow-hidden rounded-[18px] bg-brand-500">
          <div
            className={cn(
              "transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
              selectedIndex !== null ? "pointer-events-none translate-y-full" : "translate-y-0",
            )}
          >
            <TDSButton size="xl" display="block" onClick={onViewCalendar}>
              캘린더 보기
            </TDSButton>
          </div>
          <div
            className={cn(
              "absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
              selectedIndex !== null ? "translate-y-0" : "pointer-events-none translate-y-full",
            )}
          >
            <TDSButton size="xl" display="block" onClick={handleVote}>
              투표하기
            </TDSButton>
          </div>
        </div>
      </MobileStickyAction>
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
          추천안 보기
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
