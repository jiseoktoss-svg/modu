// 추천안 화면의 문장형 추천 요약(ViewModel).
// 후보 카드/필터를 나열하는 대신 "modu가 먼저 판단을 정리해주는" 짧은 문장을 만든다.
//   headline 1줄 + context comment 1줄 + avoid 0~1줄 — 보고서가 아니라 답변.
// 추천 시간 화면의 상단 판단 문구는 캘린더 화면과 같은 contextual.headline/comment 를 쓴다.
// 단일 후보 슬롯(10:00~11:00)을 먼저 노출하지 않고 날짜 전체 상태(DateAvailabilitySummary)를
// 우선 사용한다. 시간은 바쁜 기간처럼 정말 특정 시간만 의미 있을 때만 노출한다.

import { formatKoreanTime, formatKoreanTimeRange, isoToEpoch } from "@/lib/time";
import type { ContextualScheduleResult } from "./contextualResult";
import type { DateAvailabilitySummary } from "./dateAvailabilitySummary";
import type { AvailabilityLookupResult } from "./availabilityLookup";

export type RecommendationBriefItem = {
  date: string; // YYYY-MM-DD
  label: string; // "7월 9일"
  detail: string;
  tone: "good" | "neutral" | "avoid";
};

/** 문장에 등장하는 참석자 이름 — 화면에서 '필수/선택 + 이름' 벳지로 렌더한다. */
export type RecommendationNameBadge = {
  name: string;
  attendanceType: "required" | "optional";
};

export type RecommendationBrief = {
  headline: string;
  primarySentence: string;
  avoidSentence?: string;
  helperSentence?: string;

  /** 먼저 볼 날짜(문장 강조용). 첫 항목의 date 는 추천안 화면의 날짜·시간 확인 모듈
   *  초기 선택 날짜로도 쓰인다(brief.primaryItems[0]?.date). */
  primaryItems: RecommendationBriefItem[];
  avoidItems: RecommendationBriefItem[];
  /** primary/avoid 문장에 이름이 등장하는 참석자(벳지 렌더용). "{name}님" 형태로 등장한다. */
  nameBadges: RecommendationNameBadge[];
};

function dateLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** "7월 9일" / "7월 9일과 7월 10일" / 3개는 쉼표 나열. */
function joinDateLabels(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  if (labels.length === 2) return `${labels[0]}과 ${labels[1]}`;
  return labels.join(", ");
}

/** "김지훈님" / "김지훈님과 이서연님" / 3명 이상은 쉼표 나열. */
function formatNameList(names: string[]): string {
  const honored = names.map((n) => `${n}님`);
  if (honored.length <= 1) return honored.join("");
  if (honored.length === 2) return `${honored[0]}과 ${honored[1]}`;
  return honored.join(", ");
}

/** 하루 요약의 심각도: 3=필수 여러 명, 2=필수 1명, 1=상대적으로 피하면 좋은 날, 0=문제 없음. */
function avoidSeverity(summary: DateAvailabilitySummary, avoidMarked: Set<string>): number {
  if (summary.requiredIssueSlots.some((r) => r.requiredBusyNames.length >= 2)) return 3;
  if (summary.requiredIssueSlots.length > 0) return 2;
  if (avoidMarked.has(summary.date)) return 1;
  return 0;
}

function summarySlots(summary: DateAvailabilitySummary): AvailabilityLookupResult[] {
  return [
    ...summary.allAvailableSlots,
    ...summary.requiredIssueSlots,
    ...summary.optionalIssueSlots,
    ...summary.pendingSlots,
  ];
}

function compareLookupResults(a: AvailabilityLookupResult, b: AvailabilityLookupResult): number {
  if (a.requiredBusyNames.length !== b.requiredBusyNames.length) {
    return a.requiredBusyNames.length - b.requiredBusyNames.length;
  }
  if (a.totalAvailable !== b.totalAvailable) return b.totalAvailable - a.totalAvailable;
  return isoToEpoch(a.startAt) - isoToEpoch(b.startAt);
}

function pickLeastDifficultSlot(summary: DateAvailabilitySummary): AvailabilityLookupResult | null {
  const slots = summarySlots(summary);
  return slots.length > 0 ? [...slots].sort(compareLookupResults)[0] : null;
}

/** 바쁜 기간에서 차선 후보를 말해야 할 때만 날짜와 슬롯을 함께 고른다. */
function pickLeastDifficultSummary(
  summaries: DateAvailabilitySummary[],
): { summary: DateAvailabilitySummary; slot: AvailabilityLookupResult } | null {
  const candidates = summaries
    .map((summary) => ({ summary, slot: pickLeastDifficultSlot(summary) }))
    .filter(
      (item): item is { summary: DateAvailabilitySummary; slot: AvailabilityLookupResult } =>
        item.slot !== null,
    );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const result = compareLookupResults(a.slot, b.slot);
    if (result !== 0) return result;
    return a.summary.date < b.summary.date ? -1 : 1;
  })[0];
}

const MAX_PRIMARY = 3;
const MAX_AVOID = 2;
/** 전원 가능한 날짜가 이 수 이상이면 3개만 나열하지 않고 '어디만 피하면 되는지'(예외) 중심으로 말한다. */
const MANY_AVAILABLE_THRESHOLD = 4;
/** 예외 날짜를 직접 나열할 최대 개수 — 이보다 많으면 개수 중심 문구로 바꾼다. */
const EXCEPTION_LIST_MAX = 3;

export function buildRecommendationBrief(args: {
  contextual: ContextualScheduleResult;
  /** 후보 날짜별 하루 요약(날짜 오름차순). */
  summaries: DateAvailabilitySummary[];
}): RecommendationBrief {
  const { contextual, summaries } = args;
  const hasPending = contextual.hasPending;
  const avoidMarked = new Set(
    contextual.calendarMarks.filter((m) => m.tone === "avoid").map((m) => m.date),
  );

  // 문장에 등장하는 이름을 필수/선택으로 모아 둔다(화면에서 벳지로 렌더). 이름 → 유형.
  const nameBadgeMap = new Map<string, "required" | "optional">();
  const recordNames = (names: string[], requiredNames: string[]) => {
    const requiredSet = new Set(requiredNames);
    for (const name of names) {
      nameBadgeMap.set(name, requiredSet.has(name) ? "required" : "optional");
    }
  };

  if (summaries.length === 0) {
    return {
      headline: "아직 보여줄 추천이 없어요.",
      primarySentence: "회의 기간 안에 고를 수 있는 시간이 없어요. 기간을 확인해 주세요.",
      primaryItems: [],
      avoidItems: [],
      nameBadges: [],
    };
  }

  // ---- 피하면 좋은 날짜 (심각한 순, 최대 2개) ----
  const avoidPool = summaries
    .map((summary) => ({ summary, severity: avoidSeverity(summary, avoidMarked) }))
    .filter((x) => x.severity > 0)
    .sort((a, b) =>
      a.severity !== b.severity
        ? b.severity - a.severity
        : a.summary.date < b.summary.date
          ? -1
          : 1,
    );

  const avoidItems: RecommendationBriefItem[] = avoidPool.slice(0, MAX_AVOID).map((x) => {
    const requiredException = x.summary.exceptionRanges.find((e) => e.reason === "requiredBusy");
    const detail =
      x.severity >= 3
        ? "필수참석자 여러 명이 참석하기 어려워요."
        : x.severity === 2
          ? `필수참석자${requiredException ? `인 ${formatNameList(requiredException.requiredNames)}` : ""}이 참석하기 어려워요.`
          : "일부 인원이 참석하기 어려워요.";
    return { date: x.summary.date, label: dateLabel(x.summary.date), detail, tone: "avoid" };
  });

  // ---- 먼저 볼 날짜 (같은 성격끼리, 최대 3개) ----
  const avoidDates = new Set(avoidItems.map((i) => i.date));
  const tier1 = summaries.filter((s) => s.allSlotsAllAvailable);
  const tier2 = summaries.filter(
    (s) =>
      !s.allSlotsAllAvailable &&
      s.allSlotsRequiredAvailable &&
      s.allAvailableSlots.length > 0 &&
      !avoidDates.has(s.date),
  );
  const tier3 = summaries.filter(
    (s) =>
      !s.allSlotsAllAvailable &&
      !avoidDates.has(s.date) &&
      pickLeastDifficultSlot(s)?.requiredBusyNames.length === 0 &&
      !tier2.includes(s),
  );

  const timeCentric =
    contextual.context === "busyPeriod" || contextual.context === "noGoodOption";
  const primaryPool = tier1.length > 0 ? tier1 : tier2.length > 0 ? tier2 : tier3;

  let primaryItems: RecommendationBriefItem[];
  let primarySentence: string;
  // primary 가 '예외 날짜를 제외하면' 형태면, avoid 문장도 날짜 기준으로 맞춘다
  // (특정 시간만 어렵다는 narrow 문장과 섞이면 "제외" vs "그 시간만"이 모순돼 보인다).
  let exceptionCentricPrimary = false;

  if (!timeCentric && primaryPool.length > 0) {
    const lead = hasPending ? "지금까지의 응답 기준으로는 " : "";

    if (tier1.length >= MANY_AVAILABLE_THRESHOLD) {
      // 전원 가능한 날짜가 많다 — 앞 3개만 나열하면 "나머지 날짜는 왜 빠졌지?"라는 오해를 준다.
      // '어디가 좋은지'를 나열하는 대신 '어디만 피하면 되는지'(예외)를 말해 전체 상황을 알려준다.
      // primaryItems: 문장에는 안 나오지만 첫 항목 date 를 날짜·시간 확인 모듈 초기 날짜로 쓴다.
      primaryItems = tier1.slice(0, MAX_PRIMARY).map((s) => ({
        date: s.date,
        label: dateLabel(s.date),
        detail: "회의 가능 시간대 전체에 모든 인원이 참석할 수 있어요.",
        tone: "good" as const,
      }));
      // 예외 = 하루 전체를 피하는 게 나은 날짜만. 점심 직후처럼 '특정 시간만' 어려운 날은
      // (하루 중 전원 가능한 슬롯이 있고 필수 이슈도 없음) 날짜 전체 제외로 말하지 않고,
      // 아래 avoid 문장에서 그 시간대만 짚는다.
      const fullDayExceptions = summaries.filter(
        (s) =>
          !s.allSlotsAllAvailable &&
          (s.allAvailableSlots.length === 0 || s.requiredIssueSlots.length > 0),
      );
      const exceptionLabels = fullDayExceptions.map((s) => dateLabel(s.date));
      if (exceptionLabels.length >= 1 && exceptionLabels.length <= EXCEPTION_LIST_MAX) {
        const joinedEx = joinDateLabels(exceptionLabels);
        primarySentence =
          exceptionLabels.length <= 2
            ? `${lead}${joinedEx}만 제외하면, 대부분 날짜에 모든 인원이 참석할 수 있어요.`
            : `${lead}${joinedEx}을 제외하면 대부분 날짜에 모든 인원이 참석할 수 있어요.`;
        exceptionCentricPrimary = true;
      } else {
        // 전체 제외로 말할 예외가 없거나 너무 많으면 개수 중심으로 — 편한 날을 고르라고 안내한다.
        primarySentence = `${lead}전원이 참석할 수 있는 날짜가 ${tier1.length}개 있어요. 편한 날짜를 골라도 괜찮아요.`;
      }
    } else {
      const picked = primaryPool.slice(0, MAX_PRIMARY);
      primaryItems = picked.map((s) => ({
        date: s.date,
        label: dateLabel(s.date),
        detail: s.allSlotsAllAvailable
          ? "회의 가능 시간대 전체에 모든 인원이 참석할 수 있어요."
          : "필수참석자는 모두 참석할 수 있어요.",
        tone: "good" as const,
      }));
      const joined = joinDateLabels(primaryItems.map((i) => i.label));
      primarySentence =
        tier1.length > 0
          ? `${lead}${joined}을 먼저 확인해보세요. 회의 가능 시간대 전체에 모든 인원이 참석할 수 있어요.`
          : `${lead}${joined}을 먼저 확인해보세요. 필수참석자는 모두 참석할 수 있어요.`;
    }
  } else {
    // 바쁜 기간/좋은 후보 없음 — 이때만 특정 시간을 노출한다(그나마 덜 어려운 시간이 정보다).
    const leastDifficult = pickLeastDifficultSummary(summaries);
    if (leastDifficult) {
      const { summary: best, slot } = leastDifficult;
      const timeLabel = `${dateLabel(best.date)} ${formatKoreanTime(slot.startAt)}`;
      primaryItems = [
        {
          date: best.date,
          label: dateLabel(best.date),
          detail:
            slot.requiredBusyNames.length > 0
              ? `${formatNameList(slot.requiredBusyNames)}이 참석하기 어려워요.`
              : `전체 ${slot.totalParticipants}명 중 ${slot.totalAvailable}명이 참석할 수 있어요.`,
          tone: "neutral" as const,
        },
      ];
      if (slot.requiredBusyNames.length > 0) {
        recordNames(slot.requiredBusyNames, slot.requiredBusyNames); // 모두 필수참석자
        primarySentence = `굳이 고르면 ${timeLabel}이 가장 덜 어려운 후보예요. 다만 필수참석자인 ${formatNameList(slot.requiredBusyNames)}이 참석하기 어려워요.`;
      } else {
        primarySentence = `그래도 ${timeLabel}이 가장 나은 후보예요. 전체 ${slot.totalParticipants}명 중 ${slot.totalAvailable}명이 참석할 수 있어요.`;
      }
    } else {
      primaryItems = [];
      primarySentence = "회의 기간 안에 고를 수 있는 시간이 없어요. 기간을 확인해 주세요.";
    }
  }

  // ---- 피하면 좋은 문장 (0~1줄) ----
  let avoidSentence: string | undefined;
  const worstAvoid = avoidItems[0];
  if (worstAvoid) {
    const worstSummary = summaries.find((s) => s.date === worstAvoid.date);
    // 피할 날짜가 하나뿐이고 하루 평가로는 대부분 시간이 괜찮은 날(특정 시간대만 어려움)이면
    // 날짜를 통째로 피하라고 하지 않고 예외 시간으로 안내한다(점심 직후 회피 등).
    const narrowException =
      !exceptionCentricPrimary &&
      avoidItems.length === 1 &&
      worstSummary !== undefined &&
      worstSummary.requiredIssueSlots.length === 0 &&
      worstSummary.allAvailableSlots.length > 0 &&
      worstSummary.exceptionRanges.length > 0;

    if (narrowException) {
      const exception = worstSummary.exceptionRanges[0];
      recordNames(exception.names, exception.requiredNames);
      // 예외 범위는 busy 시각이 아니라 '겹치는 후보 슬롯의 병합'이라 실제보다 넓게 보일 수 있다
      // — "겹치는 회의는"으로 회의 기준임을 분명히 한다.
      avoidSentence = `다만 ${worstAvoid.label} ${formatKoreanTimeRange(
        exception.startAt,
        exception.endAt,
      )}에 겹치는 회의는 ${formatNameList(exception.names)}이 참석하기 어려워요. 그 시간을 피해서 확인해보세요.`;
    } else if (worstAvoid.detail.includes("필수참석자 여러 명")) {
      avoidSentence = `${worstAvoid.label}은 필수참석자 여러 명이 참석하기 어려워 피하는 게 좋아요.`;
    } else if (worstAvoid.detail.includes("필수참석자")) {
      avoidSentence = `${worstAvoid.label}은 필수참석자가 참석하기 어려워 피하는 게 좋아요.`;
    } else {
      avoidSentence = `${worstAvoid.label}은 일부 인원이 참석하기 어려워 다른 날짜를 먼저 보는 게 좋아요.`;
    }
  } else {
    // 피할 날짜는 없지만 특정 시간대만 어려운 날이 있으면 그 예외를 알려준다.
    const withException = summaries.find(
      (s) => s.exceptionRanges.length > 0 && s.requiredIssueSlots.length === 0,
    );
    const exception = withException?.exceptionRanges[0];
    if (withException && exception) {
      recordNames(exception.names, exception.requiredNames);
      avoidSentence = `다만 ${dateLabel(withException.date)} ${formatKoreanTimeRange(
        exception.startAt,
        exception.endAt,
      )}에 겹치는 회의는 ${formatNameList(exception.names)}이 참석하기 어려워요. 그 시간을 피해서 확인해보세요.`;
    }
  }

  return {
    headline: contextual.headline,
    primarySentence: contextual.comment || primarySentence,
    avoidSentence,
    helperSentence: undefined,
    primaryItems,
    avoidItems,
    nameBadges: [...nameBadgeMap].map(([name, attendanceType]) => ({ name, attendanceType })),
  };
}
