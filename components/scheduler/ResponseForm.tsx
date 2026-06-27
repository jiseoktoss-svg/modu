"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CalendarDays, RefreshCw, X } from "lucide-react";
import {
  loadCalendarSnapshot,
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
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import {
  blocksToCells,
  cellKey,
  cellsToBlocks,
  GRID_STEP_MINUTES,
} from "@/lib/grid";
import { MAX_MEMO_LENGTH } from "@/lib/scheduler/validate";
import {
  describeDateStr,
  formatHm,
  formatKoreanDate,
  formatKoreanTimeRange,
  kstWallToIso,
  parseHm,
} from "@/lib/time";
import type { PublicParticipant } from "@/lib/data";
import type {
  CalendarSnapshotBlock,
  CalendarSnapshotParticipant,
  VoteOption,
} from "@/lib/actionTypes";
import type { CellStatus } from "@/lib/types";

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
  const [memo, setMemo] = useState("");
  const [role, setRole] = useState("");
  const [identityName, setIdentityName] = useState("");
  const [identityRole, setIdentityRole] = useState("");
  const [editingDateIndex, setEditingDateIndex] = useState<number | null>(null);
  const [activeStatus, setActiveStatus] = useState<CellStatus>("busy");
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
          setMemo(res.memo ?? "");
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

  function paintSlot(dateIndex: number, minute: number, status: CellStatus) {
    setCells((prev) => {
      const next = { ...prev };
      const key = cellKey(dateIndex, minute);
      if (status === "available") delete next[key];
      else next[key] = status;
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
        setMemo(loaded.memo ?? "");
      }
    } else {
      setCells({});
      setMemo("");
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
      memo,
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

  const editingDate = editingDateIndex === null ? null : dates[editingDateIndex];
  const editingDateLabel = editingDate ? describeDateStr(editingDate) : null;

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
          <ArrowLeft size={16} />
          다시 확인
        </Button>
      </div>

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
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{monthDay}</p>
                    <p className="text-xs text-slate-500">{weekdayKo}요일</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-bold",
                      SUMMARY_STYLE[summary.status],
                    )}
                  >
                    {SUMMARY_LABEL[summary.status]}
                  </span>
                </div>
                {summary.status === "mixed" && (
                  <p className="mt-2 text-xs text-slate-500">
                    {[
                      summary.preferred > 0 ? `선호 ${summary.preferred}칸` : null,
                      summary.busy > 0 ? `불가 ${summary.busy}칸` : null,
                      summary.avoid > 0 ? `피함 ${summary.avoid}칸` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <div className="mt-3 grid grid-cols-3 gap-1.5">
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
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setEditingDateIndex(index)}
                >
                  시간 편집
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <Textarea
          aria-label="메모 (선택)"
          rows={2}
          maxLength={MAX_MEMO_LENGTH}
          placeholder="메모 (선택)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </Card>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {editingDateIndex !== null && editingDateLabel && (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-900/40 p-0 sm:items-center sm:p-6">
          <div className="mx-auto max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingDateLabel.monthDay} {editingDateLabel.weekdayKo}요일
              </h3>
              <button
                type="button"
                onClick={() => setEditingDateIndex(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="시간 편집 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-1.5">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.status}
                  type="button"
                  onClick={() => setActiveStatus(option.status)}
                  aria-pressed={activeStatus === option.status}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-bold transition-colors",
                    activeStatus === option.status
                      ? option.className
                      : "border-slate-200 bg-white text-slate-500",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {rows.map((minute) => {
                const status = cells[cellKey(editingDateIndex, minute)] ?? "available";
                const selectedOption = statusOption(status);
                return (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => paintSlot(editingDateIndex, minute, activeStatus)}
                    className={cn(
                      "min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors",
                      selectedOption.className,
                    )}
                  >
                    <span className="block tabular-nums">{slotLabel(minute)}</span>
                    <span className="mt-1 block text-xs opacity-80">
                      {selectedOption.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end">
              <Button type="button" onClick={() => setEditingDateIndex(null)}>
                선택 완료
              </Button>
            </div>
          </div>
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

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
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
  const [participants, setParticipants] = useState<CalendarSnapshotParticipant[]>([]);
  const [blocks, setBlocks] = useState<CalendarSnapshotBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; minute: number } | null>(
    dates[0] && rows[0] !== undefined ? { date: dates[0], minute: rows[0] } : null,
  );
  const [activeDateIndex, setActiveDateIndex] = useState(0);

  async function refreshSnapshot(showRefreshing = false) {
    if (!participantId || !token) {
      setError("본인 확인 정보가 없어 캘린더를 불러올 수 없어요.");
      setLoading(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);
    setError(null);
    const res = await loadCalendarSnapshot({ meetingId, participantId, token });
    if (res.ok) {
      setParticipants(res.participants);
      setBlocks(res.blocks);
    } else {
      setError(res.error);
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void refreshSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, participantId, token]);

  const submittedCount = participants.filter((p) => p.responseStatus === "submitted").length;
  const allSubmitted = participants.length > 0 && submittedCount === participants.length;
  const selectedSummary =
    selectedSlot && participants.length > 0
      ? summarizeCalendarSlot(participants, blocks, selectedSlot.date, selectedSlot.minute)
      : null;
  const selectedGroups =
    selectedSlot && participants.length > 0
      ? groupedParticipantsForSlot(participants, blocks, selectedSlot.date, selectedSlot.minute)
      : null;

  const gridTemplateColumns = `72px repeat(${dates.length}, minmax(128px, 1fr))`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays size={22} className="text-brand-600" />
            <h2 className="text-xl font-extrabold text-slate-900">회의 캘린더</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {selectedName ? `${selectedName}님의 시간표가 반영된 전체 일정이에요.` : "전체 일정을 확인해 주세요."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={allSubmitted ? "green" : "gray"}>
            {submittedCount}/{participants.length || "-"} 응답
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void refreshSnapshot(true)}
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />
            새로고침
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
            응답 수정
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-slate-500">
        <LegendDot className="bg-green-400" label="가능" />
        <LegendDot className="bg-blue-400" label="선호" />
        <LegendDot className="bg-red-400" label="불가능" />
        <LegendDot className="bg-slate-300" label="미응답" />
      </div>

      {/* 데스크톱: 요일 × 시간 히트맵 그리드 */}
      <Card className="hidden overflow-hidden p-0 sm:block">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div
              className="grid border-b border-slate-200 bg-slate-50"
              style={{ gridTemplateColumns }}
            >
              <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-400">
                KST
              </div>
              {dates.map((date) => {
                const { weekdayKo, monthDay } = describeDateStr(date);
                return (
                  <div
                    key={date}
                    className="border-r border-slate-200 px-3 py-3 last:border-r-0"
                  >
                    <p className="text-sm font-bold text-slate-900">{monthDay}</p>
                    <p className="text-xs text-slate-500">{weekdayKo}요일</p>
                  </div>
                );
              })}
            </div>

            {rows.map((minute) => (
              <div
                key={minute}
                className="grid border-b border-slate-100 last:border-b-0"
                style={{ gridTemplateColumns }}
              >
                <div className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-2 text-right text-xs font-medium tabular-nums text-slate-400">
                  {minute % 60 === 0 ? formatHm(minute) : ""}
                </div>
                {dates.map((date) => {
                  const summary = participants.length
                    ? summarizeCalendarSlot(participants, blocks, date, minute)
                    : null;
                  const dominant = summary?.dominant ?? "pending";
                  const isSelected =
                    selectedSlot?.date === date && selectedSlot.minute === minute;
                  const count = summary ? summary[dominant] : 0;
                  return (
                    <button
                      key={`${date}-${minute}`}
                      type="button"
                      onClick={() => setSelectedSlot({ date, minute })}
                      className={cn(
                        "min-h-12 border-r border-slate-100 px-2 py-1.5 text-left transition-colors last:border-r-0 focus:outline-none focus:ring-2 focus:ring-brand-300",
                        CALENDAR_CELL_STYLE[dominant],
                        isSelected && "relative z-0 ring-2 ring-brand-400",
                      )}
                      aria-label={`${date} ${slotLabel(minute)} ${CALENDAR_STATUS_LABEL[dominant]}`}
                    >
                      {loading ? (
                        <span className="block h-4 w-14 rounded bg-slate-200" />
                      ) : (
                        <>
                          <span className="block text-xs font-bold">
                            {CALENDAR_STATUS_LABEL[dominant]} {count > 0 ? count : ""}
                          </span>
                          {summary && dominant === "busy" && summary.preferred > 0 && (
                            <span className="mt-0.5 block text-[11px] opacity-80">
                              선호 {summary.preferred}
                            </span>
                          )}
                          {summary && dominant === "preferred" && summary.busy === 0 && (
                            <span className="mt-0.5 block text-[11px] opacity-80">
                              가능 {summary.available}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 모바일: 날짜 탭 + 시간 히트맵 리스트 */}
      <div className="space-y-3 sm:hidden">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {dates.map((date, i) => {
            const { weekdayKo, monthDay } = describeDateStr(date);
            const active = i === activeDateIndex;
            return (
              <button
                key={date}
                type="button"
                onClick={() => {
                  setActiveDateIndex(i);
                  setSelectedSlot({ date, minute: rows[0] });
                }}
                aria-pressed={active}
                className={cn(
                  "shrink-0 rounded-xl border px-3.5 py-2 text-center transition-colors",
                  active
                    ? "border-brand-400 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                )}
              >
                <span className="block text-sm font-bold leading-none">{weekdayKo}</span>
                <span className="mt-1 block text-[11px] leading-none">{monthDay}</span>
              </button>
            );
          })}
        </div>

        <Card className="space-y-1 p-3">
          {rows.map((minute) => {
            const date = dates[activeDateIndex];
            const summary = participants.length
              ? summarizeCalendarSlot(participants, blocks, date, minute)
              : null;
            const dominant = summary?.dominant ?? "pending";
            const isSelected =
              selectedSlot?.date === date && selectedSlot.minute === minute;
            const total = participants.length || 1;
            const segment = (count: number, color: string) =>
              count > 0 ? (
                <span className={color} style={{ width: `${(count / total) * 100}%` }} />
              ) : null;
            return (
              <button
                key={minute}
                type="button"
                onClick={() => setSelectedSlot({ date, minute })}
                aria-label={`${slotLabel(minute)} ${CALENDAR_STATUS_LABEL[dominant]}`}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  isSelected
                    ? "border-brand-400 bg-brand-50"
                    : "border-slate-100 hover:bg-slate-50",
                )}
              >
                <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-slate-500">
                  {formatHm(minute)}
                </span>
                <span className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  {summary && (
                    <>
                      {segment(summary.available, "bg-green-400")}
                      {segment(summary.preferred, "bg-blue-400")}
                      {segment(summary.busy, "bg-red-400")}
                      {segment(summary.avoid, "bg-amber-400")}
                      {segment(summary.pending, "bg-slate-300")}
                    </>
                  )}
                </span>
                <Badge tone={CALENDAR_BADGE_TONE[dominant]} className="shrink-0">
                  {CALENDAR_STATUS_LABEL[dominant]}
                  {summary && summary[dominant] > 0 ? ` ${summary[dominant]}` : ""}
                </Badge>
              </button>
            );
          })}
        </Card>
      </div>

      {selectedSlot && selectedSummary && selectedGroups && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900">
                {describeDateStr(selectedSlot.date).monthDay}{" "}
                {describeDateStr(selectedSlot.date).weekdayKo}요일{" "}
                {slotLabel(selectedSlot.minute)}
              </p>
              <p className="mt-1 text-xs text-slate-500">상세 사유는 표시하지 않아요.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["available", "preferred", "busy", "pending"] as CalendarStatus[]).map(
                (status) => (
                  <Badge key={status} tone={CALENDAR_BADGE_TONE[status]}>
                    {CALENDAR_STATUS_LABEL[status]} {selectedSummary[status]}
                  </Badge>
                ),
              )}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["preferred", "busy", "available", "pending"] as CalendarStatus[]).map((status) => (
              <div key={status} className="rounded-xl border border-slate-200 px-3 py-2">
                <p className="text-xs font-bold text-slate-500">
                  {CALENDAR_STATUS_LABEL[status]}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {selectedGroups[status].length > 0
                    ? selectedGroups[status].join(", ")
                    : "-"}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

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
