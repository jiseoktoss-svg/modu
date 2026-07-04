"use client";

import { NameGroup } from "@/components/scheduler/AvailabilitySearchResultPanel";
import { cn } from "@/lib/cn";
import { formatKoreanTimeRange } from "@/lib/time";
import type { DateAvailabilitySummary } from "@/lib/scheduler/dateAvailabilitySummary";

// 캘린더에서 날짜를 눌렀을 때 보여주는 '날짜 전체' 요약 패널.
// 대표 후보 시간 하나가 아니라 그 날짜 전체의 가능 상태(+예외 시간)를 먼저 말해,
// "이 날은 이 시간만 가능한가?"라는 오해를 막는다. 조회 전용 — 확정/투표가 아니다.

type DateAvailabilitySummaryPanelProps = {
  summary: DateAvailabilitySummary;
};

/** "김지훈님" / "김지훈님과 이서연님" / 3명 이상은 쉼표 나열. */
function formatNameList(names: string[]): string {
  const honored = names.map((n) => `${n}님`);
  if (honored.length <= 1) return honored.join("");
  if (honored.length === 2) return `${honored[0]}과 ${honored[1]}`;
  return honored.join(", ");
}

export function DateAvailabilitySummaryPanel({ summary }: DateAvailabilitySummaryPanelProps) {
  // 명단·필수 표시는 대표 슬롯 기준(참석자 구성은 시간과 무관하게 동일하다).
  const rep = summary.bestSlot;
  const requiredNames = new Set(
    rep
      ? [...rep.requiredAvailableNames, ...rep.requiredBusyNames, ...rep.requiredPendingNames]
      : [],
  );
  // 예외가 없는 날만 가능 명단 칩을 보여준다(예외가 있으면 시간대별로 명단이 달라진다).
  const showAvailableChips = rep !== null && summary.exceptionRanges.length === 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="break-keep text-sm font-bold text-slate-800">{summary.headline}</p>
        {summary.comment && (
          <p className="break-keep text-sm text-slate-600">{summary.comment}</p>
        )}
      </div>

      {summary.exceptionRanges.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-2">
          <p className="mb-1.5 px-0.5 text-[11px] font-bold text-red-700">피하면 좋은 시간</p>
          <ul className="space-y-1 px-0.5">
            {summary.exceptionRanges.map((exception) => (
              <li
                key={`${exception.startAt}-${exception.reason}`}
                className={cn(
                  "break-keep text-xs",
                  exception.reason === "requiredBusy"
                    ? "font-bold text-red-600"
                    : "font-medium text-red-500",
                )}
              >
                {formatKoreanTimeRange(exception.startAt, exception.endAt)} ·{" "}
                {formatNameList(exception.names)}
                {exception.reason === "requiredBusy" && " (필수참석자)"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showAvailableChips && rep && (
        <NameGroup
          tone="green"
          label="가능"
          names={rep.availableNames}
          requiredNames={requiredNames}
        />
      )}
      {rep && rep.pendingNames.length > 0 && (
        <NameGroup
          tone="slate"
          label="미응답"
          names={rep.pendingNames}
          requiredNames={requiredNames}
        />
      )}

      {(showAvailableChips || (rep && rep.pendingNames.length > 0)) && (
        <p className="px-0.5 text-[11px] text-slate-400">이름 앞 점(•)은 필수인원이에요.</p>
      )}
    </div>
  );
}
