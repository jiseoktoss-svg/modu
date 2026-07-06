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

  return (
    <div className="space-y-3">
      {/* 코멘트(summary.comment, slate-600 부연 문장)는 노출하지 않고 헤드라인만 남긴다. */}
      <p className="break-keep text-sm font-bold text-slate-800">{summary.headline}</p>

      {summary.exceptionRanges.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-2.5">
          {/* 필수참석자 이슈가 있으면 강하게(피하면 좋은 시간), 선택참석자만 어려우면 부드럽게. */}
          <p className="mb-2 px-0.5 text-[11px] font-bold text-red-700">
            {summary.exceptionRanges.some((e) => e.reason === "requiredBusy")
              ? "피하면 좋은 시간"
              : "일부 인원이 어려운 시간"}
          </p>
          {/* 값이 많을 때(예: 상황 2) 가독성: 한 줄에 시간+이름을 섞어 줄바꿈시키지 않고,
              시간대를 제목처럼 위에 두고 그 아래 이름 벳지를 감싼다. 구간마다 옅은 구분선으로 스캔을 쉽게 한다. */}
          <ul className="divide-y divide-red-100 px-0.5">
            {summary.exceptionRanges.map((exception) => (
              <li
                key={`${exception.startAt}-${exception.reason}`}
                className="space-y-1 py-2 first:pt-0 last:pb-0"
              >
                <p
                  className={cn(
                    "break-keep text-xs font-bold tabular-nums",
                    exception.reason === "requiredBusy" ? "text-red-600" : "text-red-500",
                  )}
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
