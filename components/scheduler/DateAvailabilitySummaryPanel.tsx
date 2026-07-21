"use client";

import { AttendeeNameBadge } from "@/components/scheduler/AttendeeNameBadge";
import { NameGroup } from "@/components/scheduler/AvailabilitySearchResultPanel";
import { cn } from "@/lib/cn";
import { formatKoreanTimeRange } from "@/lib/time";
import type { DateAvailabilitySummary } from "@/lib/scheduler/dateAvailabilitySummary";

// 캘린더에서 날짜를 눌렀을 때 보여주는 '날짜 전체' 요약 패널.
// 그 날짜 전체의 가능 상태(+예외 시간)를 먼저 말해 "이 날은 이 시간만 가능한가?"
// 라는 오해를 막는다. 조회 전용 — 확정/투표가 아니다.

type DateAvailabilitySummaryPanelProps = {
  summary: DateAvailabilitySummary;
};

function formatNameList(names: string[]): string {
  const honored = names.map((name) => `${name}님`);
  if (honored.length <= 1) return honored.join("");
  if (honored.length === 2) return `${honored[0]}과 ${honored[1]}`;
  return honored.join(", ");
}

function bestSlotDetails(bestSlot: NonNullable<DateAvailabilitySummary["bestSlot"]>) {
  const attendance =
    !bestSlot.hasPending && bestSlot.totalAvailable === bestSlot.totalParticipants
      ? "모든 사람이 참여할 수 있어요."
      : bestSlot.hasPending
        ? `응답한 사람 기준으로 ${bestSlot.totalAvailable}명이 참여할 수 있어요.`
        : `전체 ${bestSlot.totalParticipants}명 중 ${bestSlot.totalAvailable}명이 참여할 수 있어요.`;

  let required = "꼭 함께할 사람은 모두 참여할 수 있어요.";
  if (bestSlot.requiredBusyNames.length > 0) {
    required = `다만 꼭 함께할 사람인 ${formatNameList(
      bestSlot.requiredBusyNames,
    )}이 참여하기 어려워요.`;
  } else if (bestSlot.requiredPendingNames.length > 0) {
    required = `꼭 함께할 사람 ${bestSlot.requiredPendingNames.length}명이 아직 응답하지 않았어요.`;
  }

  return { attendance, required };
}

function formatTimeRangeList(ranges: Array<{ startAt: string; endAt: string }>) {
  return [...ranges]
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((range) => formatKoreanTimeRange(range.startAt, range.endAt))
    .join(", ");
}

function buildBestTimeCopy(summary: DateAvailabilitySummary) {
  const bestSlot = summary.bestSlot;
  if (!bestSlot) return null;

  if (summary.allSlotsAllAvailable) {
    return {
      label: "가장 나은 시간",
      headline: "이 날은 모든 시간이 괜찮아요.",
      attendance: null,
      required: null,
      hasRequiredIssue: false,
    };
  }

  const unavailableSlotCount = summary.totalSlots - summary.allAvailableSlots.length;
  const hasMoreAvailableSlots = summary.allAvailableSlots.length > unavailableSlotCount;
  if (summary.exceptionRanges.length > 0 && hasMoreAvailableSlots) {
    return {
      label: "피해야 하는 시간",
      headline: `이 날은 대부분 시간이 괜찮아요. 다만 ${formatTimeRangeList(
        summary.exceptionRanges,
      )}만 피해주세요.`,
      attendance: null,
      required: null,
      hasRequiredIssue: false,
    };
  }

  const bestSlots =
    summary.allAvailableSlots.length > 0
      ? [...summary.allAvailableSlots].sort((a, b) => a.startAt.localeCompare(b.startAt))
      : [bestSlot];
  const firstBestSlot = bestSlots[0];
  const best = bestSlotDetails(firstBestSlot);
  const pendingPrefix = firstBestSlot.hasPending ? "응답한 사람 기준으로 " : "";
  return {
    label: "가장 나은 시간",
    headline: `${pendingPrefix}이 날은 ${formatTimeRangeList(bestSlots)}이 가장 나은 시간이에요.`,
    attendance: best.attendance,
    required: best.required,
    hasRequiredIssue: firstBestSlot.requiredBusyNames.length > 0,
  };
}

export function DateAvailabilitySummaryPanel({ summary }: DateAvailabilitySummaryPanelProps) {
  const allSlots = [
    ...summary.allAvailableSlots,
    ...summary.requiredIssueSlots,
    ...summary.optionalIssueSlots,
    ...summary.pendingSlots,
  ];
  // 참석자 구성은 시간과 무관하게 동일하므로 명단 표시에만 첫 슬롯을 샘플로 쓴다.
  const sampleSlot = allSlots[0] ?? null;
  const requiredNames = new Set(
    sampleSlot
      ? [
          ...sampleSlot.requiredAvailableNames,
          ...sampleSlot.requiredBusyNames,
          ...sampleSlot.requiredPendingNames,
        ]
      : [],
  );
  // 예외가 없는 날만 가능 명단 칩을 보여준다(예외가 있으면 시간대별로 명단이 달라진다).
  const showAvailableChips = sampleSlot !== null && summary.exceptionRanges.length === 0;
  const bestTimeCopy = buildBestTimeCopy(summary);
  const exceptionRangesByTime = [...summary.exceptionRanges].sort((a, b) => {
    const startOrder = a.startAt.localeCompare(b.startAt);
    if (startOrder !== 0) return startOrder;
    return a.endAt.localeCompare(b.endAt);
  });

  return (
    <div className="space-y-3">
      {bestTimeCopy ? (
        <div className="space-y-1">
          <p className="text-[11px] font-bold text-brand-600">{bestTimeCopy.label}</p>
          <p className="break-keep text-sm font-bold text-slate-900">{bestTimeCopy.headline}</p>
          {bestTimeCopy.attendance && (
            <p className="break-keep text-sm text-slate-600">{bestTimeCopy.attendance}</p>
          )}
          {bestTimeCopy.required && (
            <p
              className={cn(
                "break-keep text-sm",
                bestTimeCopy.hasRequiredIssue ? "font-semibold text-red-600" : "text-slate-600",
              )}
            >
              {bestTimeCopy.required}
            </p>
          )}
        </div>
      ) : (
        <p className="break-keep text-sm font-bold text-slate-800">{summary.headline}</p>
      )}

      {exceptionRangesByTime.length > 0 && (
        <div className="rounded-xl bg-red-50 p-2.5">
          {/* 필수참석자 이슈가 있으면 강하게(피하면 좋은 시간), 선택참석자만 어려우면 부드럽게. */}
          <p className="mb-2 px-0.5 text-[11px] font-bold text-red-700">
            {exceptionRangesByTime.some((e) => e.reason === "requiredBusy")
              ? "피하면 좋은 시간"
              : "일부 인원이 어려운 시간"}
          </p>
          {/* 값이 많을 때(예: 상황 2) 가독성: 한 줄에 시간+이름을 섞어 줄바꿈시키지 않고,
              시간대를 제목처럼 위에 두고 그 아래 이름 벳지를 감싼다. 구간마다 옅은 구분선으로 스캔을 쉽게 한다. */}
          <ul className="divide-y divide-red-100 px-0.5">
            {exceptionRangesByTime.map((exception) => (
              <li
                key={`${exception.startAt}-${exception.reason}`}
                className="space-y-1 py-2 first:pt-0 last:pb-0"
              >
                <p
                  className="break-keep text-xs font-bold tabular-nums text-red-600"
                >
                  {formatKoreanTimeRange(exception.startAt, exception.endAt)}
                </p>
                {/* 이름은 '필수/선택' 벳지로 노출한다. */}
                <div className="flex flex-wrap gap-1">
                  {exception.names.map((name) => (
                    <AttendeeNameBadge
                      key={name}
                      name={name}
                      className="bg-white shadow-sm"
                      attendanceType={
                        exception.requiredNames.includes(name) ? "required" : "optional"
                      }
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showAvailableChips && sampleSlot && (
        <NameGroup
          tone="green"
          label="가능"
          names={sampleSlot.availableNames}
          requiredNames={requiredNames}
        />
      )}
      {sampleSlot && sampleSlot.pendingNames.length > 0 && (
        <NameGroup
          tone="slate"
          label="미응답"
          names={sampleSlot.pendingNames}
          requiredNames={requiredNames}
        />
      )}
    </div>
  );
}
