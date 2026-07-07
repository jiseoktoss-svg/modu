import {
  formatKoreanDateNoYear,
  formatKoreanTime,
  formatKoreanTimeRange,
  isoToEpoch,
} from "@/lib/time";
import type { CalendarDateQuality } from "@/lib/scheduler/calendarDateQuality";
import type { ContextualScheduleResult } from "@/lib/scheduler/contextualResult";
import type { DateAvailabilitySummary } from "@/lib/scheduler/dateAvailabilitySummary";

type CalendarNarrativeContext = Pick<ContextualScheduleResult, "comment" | "context" | "warnings">;

function formatNameList(names: string[]): string {
  const honored = names.map((name) => `${name}님`);
  if (honored.length <= 1) return honored.join("");
  if (honored.length === 2) return `${honored[0]}과 ${honored[1]}`;
  return honored.join(", ");
}

type RecommendedSlot = NonNullable<DateAvailabilitySummary["bestSlot"]>;

function pickEarliestAllAvailableSlot(
  summaries: DateAvailabilitySummary[],
): RecommendedSlot | null {
  const slots = summaries.flatMap((summary) => summary.allAvailableSlots);
  if (slots.length === 0) return null;

  return [...slots].sort((a, b) => isoToEpoch(a.startAt) - isoToEpoch(b.startAt))[0];
}

function buildEarliestAllAvailableComment(slot: RecommendedSlot | null): string | null {
  if (!slot) return null;

  return `전원이 참석 가능한 날짜 중 가장 빠른 날은 ${formatKoreanDateNoYear(slot.startAt)}이고, 그날 가장 빠른 시간은 ${formatKoreanTimeRange(slot.startAt, slot.endAt)}이에요.`;
}

export function buildCalendarAlignedComment({
  contextual,
  dateQualityByDate,
  summariesByDate,
}: {
  contextual: CalendarNarrativeContext;
  dateQualityByDate: Map<string, CalendarDateQuality>;
  summariesByDate: Map<string, DateAvailabilitySummary>;
}): string {
  const qualities = [...dateQualityByDate.values()];
  const summaries = [...summariesByDate.values()];
  if (summaries.length === 0) {
    return "날짜별 상세를 확인해 참석 가능 여부를 확인해 주세요.";
  }

  const lowCount = qualities.filter((quality) => quality.tier === "low").length;
  const highCount = qualities.filter((quality) => quality.tier === "high").length;
  const requiredIssueCount = summaries.filter(
    (summary) => summary.requiredIssueSlots.length > 0,
  ).length;
  const allAvailableCount = summaries.filter((summary) => summary.allSlotsAllAvailable).length;
  const everyDayWarning = contextual.warnings.find((warning) => warning.everyDay);

  if (contextual.context === "busyPeriod") {
    const recommendationComment = buildEarliestAllAvailableComment(
      pickEarliestAllAvailableSlot(summaries),
    );
    if (recommendationComment) return recommendationComment;

    return highCount > 0
      ? "그래도 상대적으로 나은 날짜가 있어요. 추천도 원이 많은 날짜부터 확인해 주세요."
      : "전반적으로 맞추기 어려운 기간이에요. 날짜별 상세를 확인해 가장 덜 어려운 시간을 골라 주세요.";
  }

  if (everyDayWarning) {
    return `매일 ${formatKoreanTime(everyDayWarning.startAt)}~${formatKoreanTime(everyDayWarning.endAt)}에는 필수참석자인 ${formatNameList(everyDayWarning.names)}이 참석하기 어려워요. 그 시간만 피해서 추천도 원이 많은 날짜를 확인해 주세요.`;
  }

  if (contextual.context === "noGoodOption") {
    return "이번 기간에는 필수참석자가 모두 가능한 시간이 없어요. 기간을 넓히거나 날짜별 상세를 확인해 주세요.";
  }

  if (requiredIssueCount > 0) {
    return "일부 날짜에는 필수참석자가 참석하기 어려운 시간이 있어요. 추천도 원이 많은 날짜를 먼저 확인해 주세요.";
  }

  if (lowCount > 0) {
    return "일부 날짜는 참석 가능한 인원이 적어요. 추천도 원이 많은 날짜를 먼저 확인해 주세요.";
  }

  if (allAvailableCount === summaries.length) {
    return "특별히 피해야 할 날짜는 많지 않아요. 편한 날짜를 골라도 괜찮아요.";
  }

  if (highCount > 0) {
    return "추천도 원이 많은 날짜가 있어요. 해당 날짜를 먼저 확인해 주세요.";
  }

  return "날짜별 상세를 확인해 참석 가능 여부를 확인해 주세요.";
}
