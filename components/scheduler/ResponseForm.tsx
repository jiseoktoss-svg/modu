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
import { Emoji } from "@/components/ui/Emoji";
import {
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
import { ExpiryNotice } from "@/components/layout/ExpiryNotice";
import { MobileStickyAction } from "@/components/layout/MobileStickyAction";
import { cn } from "@/lib/cn";
import { cellKey, cellsToBlocks, GRID_STEP_MINUTES } from "@/lib/grid";
import {
  describeDateStr,
  formatHm,
  formatKoreanDate,
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

type Step = "loading" | "intro" | "identity" | "availability" | "done";
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

// 상단 문장에서 클릭하면 해당 단계로 돌아가 수정할 수 있는 값(파란 강조).
function EditValue({
  fieldLabel,
  onEdit,
  children,
}: {
  fieldLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${fieldLabel} 수정`}
      className="inline rounded font-semibold text-brand-600 decoration-brand-400 decoration-2 underline-offset-4 transition-colors hover:text-brand-700 hover:underline focus:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-brand-200"
    >
      {children}
    </button>
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

// 토스트: 앱 공통 패턴(상단 고정 pill + 아이콘 + 자동 사라짐).
function Toast({ open, message, icon = "⚠️" }: { open: boolean; message: string; icon?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 top-5 z-50 inline-flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(15,23,42,0.18)] transition-all duration-200 ease-out",
        open
          ? "translate-y-0 opacity-100 blur-0"
          : "pointer-events-none -translate-y-2 opacity-0 blur-sm",
      )}
    >
      <Emoji symbol={icon} size={16} />
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
  // 가능 시간 입력(문장 빌더): 0=피하고싶은시간,1=선호시간,2=불가날짜,3=선호날짜,4=특정날짜+시간.
  const [availStep, setAvailStep] = useState(0);
  const [maxAvailStep, setMaxAvailStep] = useState(0);
  const [commonAvoid, setCommonAvoid] = useState<TimeRange[]>([]);
  const [commonPref, setCommonPref] = useState<TimeRange[]>([]);
  const [busyDates, setBusyDates] = useState<Set<string>>(() => new Set());
  const [prefDates, setPrefDates] = useState<Set<string>>(() => new Set());
  const [dateTimeBusy, setDateTimeBusy] = useState<Record<string, TimeRange[]>>({});
  const [dtDate, setDtDate] = useState<string | null>(null); // 5단계에서 시간 입력 중인 날짜
  const [draftStart, setDraftStart] = useState(workdayStart);
  const [draftEnd, setDraftEnd] = useState(workdayEnd);
  const [toast, setToast] = useState<string | null>(null);
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

  // 가능 시간 빌더: 0~4 (마지막=4). 도달한 단계까지 문장에 노출.
  const AVAIL_LAST_STEP = 4;
  const availClauseVisible = (i: number) => i <= maxAvailStep;
  const personName = selected?.name ?? identityName;
  const AVAIL_QUESTIONS = [
    `${personName}님, 특별히 공통적으로 피하고 싶은 시간대가 있으신가요? (예: 점심시간)`,
    `${personName}님이 특별히 선호하시는 시간이 있나요?`,
    "회의가 불가능한 날짜가 있나요?",
    "선호하는 날짜가 있나요?",
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
          setStep("done");
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

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  // 구조화된 입력(공통 시간대 + 불가/선호 날짜 + 특정 날짜+시간)을 우선순위로 cells → blocks 환원.
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
        let status: CellStatus | null = null;
        if (covers(dt, minute)) status = "busy"; // 특정 날짜+시간(가장 우선)
        else if (busyDates.has(ds)) status = "busy"; // 불가 날짜(하루)
        else if (prefDates.has(ds)) status = "preferred"; // 선호 날짜(하루)
        else if (covers(commonAvoid, minute)) status = "avoid"; // 공통 피하고 싶은 시간
        else if (covers(commonPref, minute)) status = "preferred"; // 공통 선호 시간
        if (status) cells[cellKey(dIdx, minute)] = status;
      }
    });
    return cellsToBlocks(cells, dates);
  }

  const addDraftRange = (target: "avoid" | "pref" | "dt") => {
    const s = parseHm(draftStart);
    const e = parseHm(draftEnd);
    if (!(e > s)) {
      showToast("시작 시간이 종료보다 빨라야 해요.");
      return;
    }
    // 근무시간 밖은 선택 불가.
    if (s < parseHm(workdayStart) || e > parseHm(workdayEnd)) {
      showToast(`근무시간 ${workdayStart}~${workdayEnd} 안에서 선택해 주세요.`);
      return;
    }
    // 선호 시간이 '피하고 싶은 시간'과 겹치면 추가 불가.
    if (target === "pref" && commonAvoid.some((a) => overlaps(s, e, a.start, a.end))) {
      showToast("피하고 싶은 시간과 겹쳐요. 다른 시간을 골라 주세요.");
      return;
    }
    const r: TimeRange = { start: s, end: e };
    if (target === "avoid") setCommonAvoid((p) => [...p, r]);
    else if (target === "pref") setCommonPref((p) => [...p, r]);
    else if (dtDate) setDateTimeBusy((p) => ({ ...p, [dtDate]: [...(p[dtDate] ?? []), r] }));
  };

  const removeRange = (target: "avoid" | "pref" | "dt", index: number, ds?: string) => {
    if (target === "avoid") setCommonAvoid((p) => p.filter((_, i) => i !== index));
    else if (target === "pref") setCommonPref((p) => p.filter((_, i) => i !== index));
    else if (ds)
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
    // 불가능으로 고른 날짜는 선호 날짜에서 제외(겹침 방지).
    setPrefDates((prev) => {
      if (!prev.has(ds)) return prev;
      const n = new Set(prev);
      n.delete(ds);
      return n;
    });
  };
  const togglePrefDate = (ds: string) =>
    setPrefDates((prev) => {
      const next = new Set(prev);
      if (next.has(ds)) next.delete(ds);
      else next.add(ds);
      return next;
    });

  const goAvail = (next: number) => {
    setAvailStep(next);
    setMaxAvailStep((m) => Math.max(m, next));
  };
  const editAvailStep = (i: number) => setAvailStep(i);
  const handleAvailNext = () => {
    if (availStep < AVAIL_LAST_STEP) goAvail(availStep + 1);
    else void handleSubmit();
  };

  // 시간 범위 추가 입력(시작~종료 + 추가) + 추가된 범위 칩 목록.
  const renderTimeAdder = (
    target: "avoid" | "pref" | "dt",
    ranges: TimeRange[],
    tone: "blue" | "red",
    onRemove: (i: number) => void,
  ) => (
    <div>
      <div className="flex items-center gap-2">
        <Input
          type="time"
          step={1800}
          min={workdayStart}
          max={workdayEnd}
          value={draftStart}
          onChange={(e) => setDraftStart(e.target.value)}
          aria-label="시작 시간"
        />
        <span className="shrink-0 text-slate-400">~</span>
        <Input
          type="time"
          step={1800}
          min={workdayStart}
          max={workdayEnd}
          value={draftEnd}
          onChange={(e) => setDraftEnd(e.target.value)}
          aria-label="종료 시간"
        />
        <TDSButton
          type="button"
          tone="secondary"
          size="md"
          className="shrink-0"
          onClick={() => addDraftRange(target)}
        >
          추가
        </TDSButton>
      </div>
      {ranges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ranges.map((r, i) => (
            <span
              key={`${r.start}-${r.end}-${i}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold",
                tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700",
              )}
            >
              {fmtRange(r)}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`${fmtRange(r)} 삭제`}
                className="ml-0.5 opacity-60 hover:opacity-100"
              >
                <Emoji symbol="❌" size={11} />
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
      setCommonAvoid([]);
      setCommonPref([]);
      setBusyDates(new Set());
      setPrefDates(new Set());
      setDateTimeBusy({});
    }

    setSelectedId(res.participantId);
    setToken(res.token);
    setIdentityName(res.name);
    setIdentityRole(res.role);
    setRole(res.role);

    setAvailStep(0);
    setMaxAvailStep(0);
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
    setStep("done");
  }

  // 본인확인 단계가 바뀌면 입력에 포커스(최초 진입은 건너뜀, 스크롤 점프 방지).
  useEffect(() => {
    if (step !== "identity") return;
    if (skipFormFocus.current) {
      skipFormFocus.current = false;
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
        <div className="mt-8 pb-8 pt-5">
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
      </div>
    );
  }

  if (step === "done") {
    return (
      <>
        <SubmittedCalendarScreen
          meetingId={meetingId}
          participantId={selectedId}
          token={token}
          selectedName={selected?.name ?? identityName}
          dates={dates}
          rows={rows}
          onEdit={() => {
            // 본인은 이미 확인됨 → 가능 시간 화면 처음부터 다시.
            setAvailStep(0);
            setMaxAvailStep(0);
            setStep("availability");
          }}
        />
        <ExpiryNotice className="mt-8" />
      </>
    );
  }

  // step === "identity": 본인확인(이름 → 직무) 문장 빌더.
  if (step === "identity") {
    return (
      <>
        <Toast open={toast !== null} message={toast ?? ""} />
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

          <div className="mt-8 pb-8 pt-5">
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
          </div>
        </div>
      </>
    );
  }

  // step === "availability": 가능 시간 문장 빌더(5단계).
  return (
    <>
      <Toast open={toast !== null} message={toast ?? ""} />
      <div className="mx-auto w-full max-w-2xl pb-28">
        {/* 상단: 답변이 쌓이는 문장 */}
        <p className="pt-2 text-sm font-medium text-slate-400">가능 시간</p>
        <div
          aria-live="polite"
          className="mt-3 break-keep text-left text-xl leading-relaxed text-slate-800 sm:text-2xl sm:leading-relaxed"
        >
          {availClauseVisible(0) && (
            <span className="animate-fade-in motion-reduce:animate-none">
              저는 모든 요일 공통적으로{" "}
              {commonAvoid.length > 0 ? (
                <>
                  <EditValue fieldLabel="피하고 싶은 시간" onEdit={() => editAvailStep(0)}>
                    {commonAvoid.map(fmtRange).join(", ")}
                  </EditValue>
                  는 피하고 싶어요.{" "}
                </>
              ) : (
                <EditValue fieldLabel="피하고 싶은 시간" onEdit={() => editAvailStep(0)}>
                  특별히 피하고 싶은 시간은 없어요.
                </EditValue>
              )}{" "}
            </span>
          )}
          {availClauseVisible(1) && (
            <span className="animate-fade-in motion-reduce:animate-none">
              {commonPref.length > 0 ? (
                <>
                  <EditValue fieldLabel="선호 시간" onEdit={() => editAvailStep(1)}>
                    {commonPref.map(fmtRange).join(", ")}
                  </EditValue>
                  는 선호해요!{" "}
                </>
              ) : (
                <EditValue fieldLabel="선호 시간" onEdit={() => editAvailStep(1)}>
                  특별히 선호하는 시간은 없어요.
                </EditValue>
              )}{" "}
            </span>
          )}
          {availClauseVisible(2) && (
            <span className="animate-fade-in motion-reduce:animate-none">
              {busyDates.size > 0 ? (
                <>
                  <EditValue fieldLabel="불가능한 날짜" onEdit={() => editAvailStep(2)}>
                    {[...busyDates].sort().map(fmtMD).join(", ")}
                  </EditValue>
                  에는 회의가 불가능해요.{" "}
                </>
              ) : (
                <EditValue fieldLabel="불가능한 날짜" onEdit={() => editAvailStep(2)}>
                  불가능한 날짜는 없어요.
                </EditValue>
              )}{" "}
            </span>
          )}
          {availClauseVisible(3) && (
            <span className="animate-fade-in motion-reduce:animate-none">
              {prefDates.size > 0 ? (
                <>
                  <EditValue fieldLabel="선호하는 날짜" onEdit={() => editAvailStep(3)}>
                    {[...prefDates].sort().map(fmtMD).join(", ")}
                  </EditValue>
                  는 선호해요!{" "}
                </>
              ) : (
                <EditValue fieldLabel="선호하는 날짜" onEdit={() => editAvailStep(3)}>
                  특별히 선호하는 날짜는 없어요.
                </EditValue>
              )}{" "}
            </span>
          )}
          {availClauseVisible(4) && (
            <span className="animate-fade-in motion-reduce:animate-none">
              {Object.keys(dateTimeBusy).length > 0 ? (
                <>
                  <EditValue fieldLabel="특정 날짜 시간" onEdit={() => editAvailStep(4)}>
                    {Object.entries(dateTimeBusy)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([ds, rs]) => `${fmtMD(ds)} ${rs.map(fmtRange).join("·")}`)
                      .join(", ")}
                  </EditValue>
                  에는 안 돼요.
                </>
              ) : (
                <EditValue fieldLabel="특정 날짜 시간" onEdit={() => editAvailStep(4)}>
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
            {availStep === 0 &&
              renderTimeAdder("avoid", commonAvoid, "red", (i) => removeRange("avoid", i))}
            {availStep === 1 &&
              renderTimeAdder("pref", commonPref, "blue", (i) => removeRange("pref", i))}
            {availStep === 2 && (
              <MonthCalendar dates={dates} selected={busyDates} onToggle={toggleBusyDate} tone="busy" />
            )}
            {availStep === 3 && (
              <MonthCalendar
                dates={dates}
                selected={prefDates}
                onToggle={togglePrefDate}
                tone="pref"
                blockedDates={busyDates}
              />
            )}
            {availStep === 4 && (
              <div className="space-y-3">
                <MonthCalendar
                  dates={dates}
                  selected={new Set([...Object.keys(dateTimeBusy), ...(dtDate ? [dtDate] : [])])}
                  onToggle={(ds) => setDtDate((cur) => (cur === ds ? null : ds))}
                  tone="busy"
                />
                {dtDate && (
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-sm font-bold text-slate-700">{fmtMD(dtDate)} 안 되는 시간</p>
                    <div className="mt-2">
                      {renderTimeAdder("dt", dateTimeBusy[dtDate] ?? [], "red", (i) =>
                        removeRange("dt", i, dtDate),
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 하단 고정 CTA */}
      <MobileStickyAction
        bleed={false}
        className="fixed inset-x-0 bottom-0 z-10 sm:p-0"
        innerClassName="max-w-2xl sm:px-6 sm:py-3"
      >
        <TDSButton
          size="xl"
          display="block"
          onClick={handleAvailNext}
          disabled={availStep === AVAIL_LAST_STEP && submitting}
          loading={availStep === AVAIL_LAST_STEP && submitting}
        >
          {availStep === AVAIL_LAST_STEP
            ? submitting
              ? "저장 중..."
              : token
                ? "수정 저장하기"
                : "응답 제출하기"
            : "다음"}
        </TDSButton>
      </MobileStickyAction>
    </>
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
  meetingId,
  participantId,
  token,
  selectedName,
  dates,
  rows,
  onEdit,
}: {
  meetingId: string;
  participantId: string | null;
  token: string | null;
  selectedName: string;
  dates: string[];
  rows: number[];
  onEdit: () => void;
}) {
  // 데모 단계: 항상 더미 6명 응답으로 캘린더를 채운다.
  const { participants, blocks } = useMemo(
    () => buildDummySnapshot(dates, rows),
    [dates, rows],
  );

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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Emoji symbol="📅" size={22} />
            <h2 className="text-xl font-extrabold text-slate-900">회의 캘린더</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            모든 참석자의 선호·불가 시간을 시간대별로 모았어요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="green">{participants.length}명 응답</Badge>
          <TDSButton type="button" size="sm" tone="secondary" onClick={onEdit}>
            응답 수정
          </TDSButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-slate-500">
        <LegendDot className="bg-green-400" label="선호" />
        <LegendDot className="bg-red-400" label="불가능" />
        <span className="text-slate-400">칸 안의 이름 색은 참석자별로 달라요.</span>
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
                  const preferred = evaluated.filter((e) => e.status === "preferred");
                  const busy = evaluated.filter((e) => e.status === "busy");
                  return (
                    <div
                      key={date}
                      className="w-52 shrink-0 space-y-1 border-r border-slate-100 p-1.5 last:border-r-0"
                    >
                      {preferred.length > 0 && (
                        <StatusGroup tone="green" label="선호" people={preferred} />
                      )}
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

      {participantId && token && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">후보 시간대 투표</h3>
            <span className="text-sm text-slate-500">다수결 기준</span>
          </div>
          <VotingPanel meetingId={meetingId} participantId={participantId} token={token} />
        </section>
      )}
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
