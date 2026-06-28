"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
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
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import {
  blocksToCells,
  cellKey,
  cellsToBlocks,
  GRID_STEP_MINUTES,
} from "@/lib/grid";
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
  dates: string[];
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  initialParticipants: PublicParticipant[];
}

type Step = "loading" | "select" | "fill" | "done";
type DateSummaryStatus = "available" | "preferred" | "busy" | "mixed";
type CalendarStatus = "available" | "preferred" | "avoid" | "busy" | "pending";

const STATUS_OPTIONS: Array<{
  status: CellStatus;
  label: string;
  className: string;
}> = [
  {
    status: "available",
    label: "가능",
    className: "border-green-200 bg-green-50 text-green-700",
  },
  {
    status: "preferred",
    label: "선호",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  {
    status: "busy",
    label: "불가능",
    className: "border-red-200 bg-red-50 text-red-700",
  },
];

const SUMMARY_STYLE: Record<DateSummaryStatus, string> = {
  available: "border-green-200 bg-green-50 text-green-700",
  preferred: "border-blue-200 bg-blue-50 text-blue-700",
  busy: "border-red-200 bg-red-50 text-red-700",
  mixed: "border-amber-200 bg-amber-50 text-amber-700",
};

const SUMMARY_LABEL: Record<DateSummaryStatus, string> = {
  available: "가능",
  preferred: "선호",
  busy: "불가능",
  mixed: "시간 조정",
};

const CALENDAR_STATUS_LABEL: Record<CalendarStatus, string> = {
  available: "가능",
  preferred: "선호",
  avoid: "피함",
  busy: "불가",
  pending: "미응답",
};

const CALENDAR_CELL_STYLE: Record<CalendarStatus, string> = {
  available: "border-slate-100 bg-white text-slate-500 hover:bg-slate-50",
  preferred: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  avoid: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  busy: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  pending: "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
};

const CALENDAR_BADGE_TONE: Record<CalendarStatus, "gray" | "green" | "red" | "amber" | "blue"> = {
  available: "green",
  preferred: "blue",
  avoid: "amber",
  busy: "red",
  pending: "gray",
};

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

function slotLabel(minute: number) {
  return `${formatHm(minute)}~${formatHm(minute + GRID_STEP_MINUTES)}`;
}

function statusOption(status: CellStatus) {
  return (
    STATUS_OPTIONS.find((option) => option.status === status) ?? {
      status,
      label: "피함",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    }
  );
}

interface CalendarSlotSummary {
  available: number;
  preferred: number;
  avoid: number;
  busy: number;
  pending: number;
  dominant: CalendarStatus;
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

function dominantStatus(summary: Omit<CalendarSlotSummary, "dominant">): CalendarStatus {
  if (summary.busy > 0) return "busy";
  if (summary.preferred > 0) return "preferred";
  if (summary.avoid > 0) return "avoid";
  if (summary.pending > 0) return "pending";
  return "available";
}

function summarizeCalendarSlot(
  participants: CalendarSnapshotParticipant[],
  blocks: CalendarSnapshotBlock[],
  date: string,
  minute: number,
): CalendarSlotSummary {
  const slotStart = epoch(kstWallToIso(date, minute));
  const slotEnd = epoch(kstWallToIso(date, minute + GRID_STEP_MINUTES));
  const summary = {
    available: 0,
    preferred: 0,
    avoid: 0,
    busy: 0,
    pending: 0,
  };

  for (const participant of participants) {
    const status = participantStatusForSlot(participant, blocks, slotStart, slotEnd);
    summary[status] += 1;
  }

  return {
    ...summary,
    dominant: dominantStatus(summary),
  };
}

function groupedParticipantsForSlot(
  participants: CalendarSnapshotParticipant[],
  blocks: CalendarSnapshotBlock[],
  date: string,
  minute: number,
) {
  const slotStart = epoch(kstWallToIso(date, minute));
  const slotEnd = epoch(kstWallToIso(date, minute + GRID_STEP_MINUTES));
  const groups: Record<CalendarStatus, string[]> = {
    available: [],
    preferred: [],
    avoid: [],
    busy: [],
    pending: [],
  };

  for (const participant of participants) {
    const status = participantStatusForSlot(participant, blocks, slotStart, slotEnd);
    groups[status].push(participant.name);
  }

  return groups;
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

export function ResponseForm(props: Props) {
  const { meetingId, dates, workdayStart, workdayEnd } = props;
  const participants = props.initialParticipants;
  const rows = useMemo(
    () => buildRows(workdayStart, workdayEnd),
    [workdayStart, workdayEnd],
  );

  const [step, setStep] = useState<Step>("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [cells, setCells] = useState<Record<string, CellStatus>>({});
  const [role, setRole] = useState("");
  const [identityName, setIdentityName] = useState("");
  const [identityRole, setIdentityRole] = useState("");
  const [commonStatus, setCommonStatus] = useState<CellStatus>("preferred");
  const [commonStart, setCommonStart] = useState(workdayStart);
  const [commonEnd, setCommonEnd] = useState(workdayEnd);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = participants.find((p) => p.id === selectedId) ?? null;
  const roleOptions = Array.from(
    new Set(participants.map((p) => p.role.trim()).filter(Boolean)),
  );
  const summaries = dates.map((_, index) => summarizeDate(index, rows, cells));
  const preferredDateCount = summaries.filter((s) => s.status === "preferred").length;
  const busyDateCount = summaries.filter((s) => s.status === "busy").length;
  const adjustedDateCount = summaries.filter((s) => s.status === "mixed").length;
  const availableDateCount = dates.length - preferredDateCount - busyDateCount - adjustedDateCount;

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey(meetingId));
    if (!raw) {
      setStep("select");
      return;
    }
    let parsed: { participantId?: string; token?: string } | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!parsed?.participantId || !parsed.token) {
      setStep("select");
      return;
    }
    const identity = { participantId: parsed.participantId, token: parsed.token };
    setSelectedId(identity.participantId);
    setToken(identity.token);
    loadParticipantResponse({ meetingId, ...identity })
      .then((res) => {
        if (res.ok) {
          setCells(blocksToCells(res.blocks, dates));
          const found = participants.find((p) => p.id === identity.participantId);
          setRole(found?.role ?? "");
          setIdentityName(found?.name ?? "");
          setIdentityRole(found?.role ?? "");
          setStep("done");
        } else {
          window.localStorage.removeItem(storageKey(meetingId));
          setSelectedId(null);
          setToken(null);
          setStep("select");
        }
      })
      .catch(() => setStep("select"));
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

  function setWholeDate(dateIndex: number, status: CellStatus) {
    setCells((prev) => {
      const next = { ...prev };
      for (const minute of rows) {
        const key = cellKey(dateIndex, minute);
        if (status === "available") delete next[key];
        else next[key] = status;
      }
      return next;
    });
  }

  function applyCommonRange() {
    const s = parseHm(commonStart);
    const e = parseHm(commonEnd);
    if (!(s < e)) {
      setError("공통 시간의 시작은 종료보다 빨라야 해요.");
      return;
    }
    setError(null);
    setCells((prev) => {
      const next = { ...prev };
      for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
        for (const minute of rows) {
          if (minute >= s && minute + GRID_STEP_MINUTES <= e) {
            const key = cellKey(dateIndex, minute);
            if (commonStatus === "available") delete next[key];
            else next[key] = commonStatus;
          }
        }
      }
      return next;
    });
  }

  async function handleVerifyIdentity() {
    setVerifying(true);
    setError(null);
    const saved = storedIdentity();
    const res = await verifyParticipantIdentity({
      meetingId,
      name: identityName,
      role: identityRole,
      token: saved?.token,
    });
    setVerifying(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setSelectedId(res.participantId);
    setToken(res.token);
    setIdentityName(res.name);
    setIdentityRole(res.role);
    setRole(res.role);

    if (res.responseStatus === "submitted") {
      const loaded = await loadParticipantResponse({
        meetingId,
        participantId: res.participantId,
        token: res.token,
      });
      if (loaded.ok) {
        setCells(blocksToCells(loaded.blocks, dates));
      }
    } else {
      setCells({});
    }

    setStep("fill");
  }

  async function handleSubmit() {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    const blocks = cellsToBlocks(cells, dates);
    const res = await submitAvailability({
      meetingId,
      participantId: selectedId,
      token,
      role,
      blocks,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setToken(res.token);
    persistIdentity(res.participantId, res.token);
    setStep("done");
  }

  if (step === "loading") {
    return (
      <Card className="mx-auto max-w-2xl">
        <p className="text-sm text-slate-500">불러오는 중...</p>
      </Card>
    );
  }

  if (step === "done") {
    return (
      <SubmittedCalendarScreen
        meetingId={meetingId}
        participantId={selectedId}
        token={token}
        selectedName={selected?.name ?? identityName}
        dates={dates}
        rows={rows}
        onEdit={() => setStep("fill")}
      />
    );
  }

  if (step === "select") {
    return (
      <Card className="mx-auto max-w-2xl space-y-4">
        <CardTitle>본인 확인</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="identityName">이름</Label>
            <Input
              id="identityName"
              value={identityName}
              onChange={(e) => setIdentityName(e.target.value)}
              placeholder="이름 입력"
              autoComplete="name"
            />
          </div>
          <div>
            <Label htmlFor="identityRole">직무</Label>
            <Select
              id="identityRole"
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
          </div>
        </div>
        {error && (
          <p className="text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            onClick={handleVerifyIdentity}
            disabled={!identityName.trim() || !identityRole || verifying}
          >
            {verifying ? "확인 중..." : "확인하고 다음"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900">{selected?.name}</h2>
          {selected && (
            <Badge tone={selected.attendanceType === "required" ? "brand" : "gray"}>
              {selected.attendanceType === "required" ? "필수" : "선택"}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setStep("select")}>
          다시 확인
        </Button>
      </div>

      <Card className="space-y-3 p-4">
        <div>
          <CardTitle className="text-base">공통 시간 일괄 적용</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            선택한 시간대를 모든 날짜에 한 번에 적용해요.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.status}
              type="button"
              onClick={() => setCommonStatus(option.status)}
              aria-pressed={commonStatus === option.status}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-bold transition-colors",
                commonStatus === option.status
                  ? option.className
                  : "border-slate-200 bg-white text-slate-500",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="time"
            step={1800}
            value={commonStart}
            onChange={(e) => setCommonStart(e.target.value)}
            aria-label="공통 시작 시간"
          />
          <span className="shrink-0 text-slate-400">~</span>
          <Input
            type="time"
            step={1800}
            value={commonEnd}
            onChange={(e) => setCommonEnd(e.target.value)}
            aria-label="공통 종료 시간"
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            onClick={applyCommonRange}
          >
            적용
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone="green">가능 {availableDateCount}일</Badge>
          <Badge tone="blue">선호 {preferredDateCount}일</Badge>
          <Badge tone="red">불가능 {busyDateCount}일</Badge>
          {adjustedDateCount > 0 && <Badge tone="amber">시간 조정 {adjustedDateCount}일</Badge>}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {dates.map((date, index) => {
            const { weekdayKo, monthDay } = describeDateStr(date);
            const summary = summaries[index];
            return (
              <div key={date} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-3 flex items-baseline gap-2">
                  <p className="font-bold text-slate-900">{monthDay}</p>
                  <p className="text-xs text-slate-500">{weekdayKo}요일</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.status}
                      type="button"
                      onClick={() => setWholeDate(index, option.status)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-xs font-bold transition-colors hover:bg-slate-50",
                        summary.status === option.status
                          ? option.className
                          : "border-slate-200 bg-white text-slate-500",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <Emoji symbol="⚠️" size={16} />
          {error}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-4 py-3 sm:px-6">
          <Button size="lg" className="w-full" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "저장 중..." : token ? "수정 저장하기" : "응답 제출하기"}
          </Button>
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
          <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
            응답 수정
          </Button>
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
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => void load()}
        >
          후보 다시 확인
        </Button>
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
