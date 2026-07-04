"use client";

import { Emoji } from "@/components/ui/Emoji";
import { cn } from "@/lib/cn";
import { formatKoreanTimeRange } from "@/lib/time";
import type { AvailabilityLookupResult } from "@/lib/scheduler/availabilityLookup";

// 특정 시간 검색 결과 카드 — 추천안/캘린더 화면 공용.
// 검색한 시간 기준 가능/불가능/미응답 명단과 요약 톤을 보여준다. 확정/투표 기능이 아니다.

type AvailabilitySearchResultPanelProps = {
  result: AvailabilityLookupResult;
  /** 결과 지우기(✕). 없으면 닫기 버튼을 그리지 않는다. */
  onClear?: () => void;
};

/** "김지훈님" / "김지훈님과 이서연님" / 3명 이상은 쉼표 나열 (contextualResult 와 동일 규칙). */
function formatNameList(names: string[]): string {
  const honored = names.map((n) => `${n}님`);
  if (honored.length <= 1) return honored.join("");
  if (honored.length === 2) return `${honored[0]}과 ${honored[1]}`;
  return honored.join(", ");
}

// 가능/불가능/미응답 명단 그룹 — 캘린더 참석 명단과 동일한 톤.
// 날짜 요약 패널(DateAvailabilitySummaryPanel)도 함께 쓴다.
export function NameGroup({
  tone,
  label,
  names,
  requiredNames,
}: {
  tone: "green" | "red" | "slate";
  label: string;
  names: string[];
  requiredNames: Set<string>;
}) {
  if (names.length === 0) return null;
  const styles = {
    green: { box: "border-green-200 bg-green-50", head: "text-green-700", chip: "text-green-800" },
    red: { box: "border-red-200 bg-red-50", head: "text-red-700", chip: "text-red-800" },
    slate: { box: "border-slate-200 bg-slate-50", head: "text-slate-500", chip: "text-slate-600" },
  }[tone];
  return (
    <div className={cn("rounded-xl border p-2", styles.box)}>
      <p className={cn("mb-1.5 px-0.5 text-[11px] font-bold", styles.head)}>
        {label} {names.length}명
      </p>
      <div className="flex flex-wrap gap-1">
        {names.map((name) => (
          <span
            key={name}
            className={cn(
              "inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold shadow-sm",
              styles.chip,
            )}
          >
            {requiredNames.has(name) && (
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" aria-hidden="true" />
            )}
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AvailabilitySearchResultPanel({
  result,
  onClear,
}: AvailabilitySearchResultPanelProps) {
  const [, m, d] = result.date.split("-").map(Number);
  const title = `${m}월 ${d}일 ${formatKoreanTimeRange(result.startAt, result.endAt)} 기준`;

  const requiredNames = new Set([
    ...result.requiredAvailableNames,
    ...result.requiredBusyNames,
    ...result.requiredPendingNames,
  ]);

  // 요약 톤: 전원 가능(긍정) > 필수 불가(주의/피함) > 잠정/무난.
  const allAvailable =
    !result.hasPending && result.totalAvailable === result.totalParticipants;
  const summaryLines: { text: string; className: string }[] = [];

  if (result.hasPending) {
    summaryLines.push({
      text: `아직 ${result.totalPending}명이 응답하지 않아 잠정 결과예요.`,
      className: "text-slate-500",
    });
  }

  if (allAvailable) {
    summaryLines.push({
      text: "모든 인원이 참석할 수 있어요.",
      className: "font-bold text-brand-600",
    });
  } else {
    summaryLines.push({
      text: result.hasPending
        ? `응답한 사람 기준으로는 ${result.totalAvailable}명이 참석할 수 있어요.`
        : `전체 ${result.totalParticipants}명 중 ${result.totalAvailable}명이 참석할 수 있어요.`,
      className: "font-semibold text-slate-700",
    });

    if (result.requiredBusyNames.length >= 1) {
      summaryLines.push({
        text: `필수참석자인 ${formatNameList(result.requiredBusyNames)}이 참석하기 어려워요.${
          result.requiredBusyNames.length >= 2 ? " 이 시간은 피하는 게 좋아요." : ""
        }`,
        className: cn(
          "font-semibold text-red-600",
          result.requiredBusyNames.length >= 2 && "font-bold",
        ),
      });
    } else if (result.requiredPendingNames.length > 0) {
      summaryLines.push({
        text: `필수참석자 중 ${result.requiredPendingNames.length}명이 아직 응답하지 않았어요.`,
        className: "text-slate-500",
      });
    } else {
      summaryLines.push({
        text: "필수참석자는 모두 참석할 수 있어요.",
        className: "font-semibold text-slate-700",
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold text-slate-400">검색 결과</p>
          <p className="mt-0.5 text-base font-bold text-slate-900">{title}</p>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="검색 결과 지우기"
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
          >
            <Emoji symbol="✕" size={14} />
          </button>
        )}
      </div>

      <div className="space-y-0.5">
        {summaryLines.map((line) => (
          <p key={line.text} className={cn("break-keep text-sm", line.className)}>
            {line.text}
          </p>
        ))}
      </div>

      <NameGroup tone="green" label="가능" names={result.availableNames} requiredNames={requiredNames} />
      <NameGroup tone="red" label="참석하기 어려움" names={result.busyNames} requiredNames={requiredNames} />
      <NameGroup tone="slate" label="미응답" names={result.pendingNames} requiredNames={requiredNames} />

      <p className="px-0.5 text-[11px] text-slate-400">
        이름 앞 점(•)은 필수인원이에요. 검색 결과는 참고용이에요.
      </p>
    </div>
  );
}
