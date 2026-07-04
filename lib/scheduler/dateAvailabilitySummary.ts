// 날짜 전체 요약 — 캘린더에서 날짜를 눌렀을 때 "이 날은 특정 시간만 가능한가?"라는
// 오해를 막기 위해, 그 날짜의 모든 후보 시간을 평가해 하루 단위 상태로 요약한다.
// 후보 시간 생성은 generateSlots 를 재사용해 근무시간·회의 길이·점심 제외 규칙이
// 추천 엔진과 어긋나지 않게 한다. 조회 전용 — 확정/투표 기능이 아니다.

import { formatKoreanTimeRange, isoToEpoch } from "@/lib/time";
import { generateSlots } from "./generateSlots";
import {
  lookupAvailabilityAtTime,
  type AvailabilityLookupBlock,
  type AvailabilityLookupParticipant,
  type AvailabilityLookupResult,
} from "./availabilityLookup";

export type DateAvailabilityException = {
  startAt: string;
  endAt: string;
  names: string[];
  requiredNames: string[];
  optionalNames: string[];
  // pending 은 시간이 아니라 사람 단위 상태라 예외 구간으로 만들지 않고 문구로만 다룬다.
  // (타입은 향후 확장을 위해 남겨 둔다.)
  reason: "requiredBusy" | "optionalBusy" | "pending";
};

export type DateAvailabilitySummary = {
  date: string;

  totalSlots: number;

  allSlotsAllAvailable: boolean;
  allSlotsRequiredAvailable: boolean;

  allAvailableSlots: AvailabilityLookupResult[];
  requiredIssueSlots: AvailabilityLookupResult[];
  optionalIssueSlots: AvailabilityLookupResult[];
  pendingSlots: AvailabilityLookupResult[];

  bestSlot: AvailabilityLookupResult | null;

  headline: string;
  comment: string;

  exceptionRanges: DateAvailabilityException[];
};

/** "김지훈님" / "김지훈님과 이서연님" / 3명 이상은 쉼표 나열 (contextualResult 와 동일 규칙). */
function formatNameList(names: string[]): string {
  const honored = names.map((n) => `${n}님`);
  if (honored.length <= 1) return honored.join("");
  if (honored.length === 2) return `${honored[0]}과 ${honored[1]}`;
  return honored.join(", ");
}

/** 그날의 가장 나은 시간: 필수 불가 적음 > 가능 인원 많음 > 이른 시간. */
function compareResults(a: AvailabilityLookupResult, b: AvailabilityLookupResult): number {
  if (a.requiredBusyNames.length !== b.requiredBusyNames.length) {
    return a.requiredBusyNames.length - b.requiredBusyNames.length;
  }
  if (a.totalAvailable !== b.totalAvailable) return b.totalAvailable - a.totalAvailable;
  return isoToEpoch(a.startAt) - isoToEpoch(b.startAt);
}

/** 불가 인원이 있는 슬롯들을 예외 구간으로 병합한다 — 같은 명단·같은 수위의
 *  연속(인접·겹침) 슬롯은 하나로 묶는다(30분 슬롯 나열 방지, buildWarnings 와 동일 발상). */
function buildExceptionRanges(results: AvailabilityLookupResult[]): DateAvailabilityException[] {
  const issues = results
    .filter((r) => r.busyNames.length > 0)
    .sort((a, b) => isoToEpoch(a.startAt) - isoToEpoch(b.startAt));

  const merged: DateAvailabilityException[] = [];
  for (const r of issues) {
    const reason: DateAvailabilityException["reason"] =
      r.requiredBusyNames.length > 0 ? "requiredBusy" : "optionalBusy";
    const last = merged.at(-1);
    if (
      last &&
      last.reason === reason &&
      last.names.join("|") === r.busyNames.join("|") &&
      isoToEpoch(r.startAt) <= isoToEpoch(last.endAt)
    ) {
      if (isoToEpoch(r.endAt) > isoToEpoch(last.endAt)) last.endAt = r.endAt;
    } else {
      merged.push({
        startAt: r.startAt,
        endAt: r.endAt,
        names: r.busyNames,
        requiredNames: r.requiredBusyNames,
        optionalNames: r.optionalBusyNames,
        reason,
      });
    }
  }

  // 필수 불가 구간을 먼저(심각한 순), 그 안에서는 이른 시간 순.
  return merged.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "requiredBusy" ? -1 : 1;
    return isoToEpoch(a.startAt) - isoToEpoch(b.startAt);
  });
}

export function buildDateAvailabilitySummary(
  date: string,
  results: AvailabilityLookupResult[],
): DateAvailabilitySummary {
  const totalSlots = results.length;
  const allSlotsAllAvailable =
    totalSlots > 0 &&
    results.every((r) => !r.hasPending && r.totalAvailable === r.totalParticipants);
  const allSlotsRequiredAvailable =
    totalSlots > 0 &&
    results.every(
      (r) => r.requiredBusyNames.length === 0 && r.requiredPendingNames.length === 0,
    );

  const allAvailableSlots = results.filter(
    (r) => !r.hasPending && r.totalAvailable === r.totalParticipants,
  );
  const requiredIssueSlots = results.filter((r) => r.requiredBusyNames.length > 0);
  const optionalIssueSlots = results.filter(
    (r) => r.requiredBusyNames.length === 0 && r.optionalBusyNames.length > 0,
  );
  const pendingSlots = results.filter((r) => r.hasPending);

  const bestSlot = totalSlots > 0 ? [...results].sort(compareResults)[0] : null;
  const exceptionRanges = buildExceptionRanges(results);

  // ---- 문구 ----
  let headline = "";
  let comment = "";

  if (totalSlots === 0) {
    headline = "이 날은 고를 수 있는 회의 시간이 없어요.";
    comment = "회의 기간과 근무 시간을 확인해 주세요.";
  } else {
    const pendingCount = results[0].totalPending;
    const noBusyAnywhere = results.every((r) => r.busyNames.length === 0);

    if (allSlotsAllAvailable) {
      // "하루 종일"(24시간처럼 읽힘)이나 "모든 시간" 대신 "회의 가능 시간대 전체"로 쓴다.
      headline = "이 날은 회의 가능 시간대 전체에 모든 인원이 참석할 수 있어요.";
      comment = "어느 시간을 골라도 괜찮아요.";
    } else if (noBusyAnywhere && pendingCount > 0) {
      headline = "이 날은 응답한 사람 기준으로 회의 가능 시간대 전체에 참석할 수 있어요.";
    } else if (requiredIssueSlots.length === totalSlots) {
      // 어느 시간을 골라도 필수참석자가 빠진다.
      headline = "이 날은 모든 인원이 맞는 시간이 없어요.";
      comment = "필수참석자가 모두 가능한 시간대를 먼저 확인하는 게 좋아요.";
    } else if (requiredIssueSlots.length > 0) {
      headline = "이 날은 일부 시간에 필수참석자가 참석하기 어려워요.";
      const worst = exceptionRanges.find((x) => x.reason === "requiredBusy");
      if (worst) {
        comment = `${formatKoreanTimeRange(worst.startAt, worst.endAt)}에는 ${formatNameList(
          worst.requiredNames,
        )}이 참석하기 어려우니 피하는 게 좋아요.`;
      }
    } else if (allAvailableSlots.length > 0) {
      headline = "이 날은 대부분 시간에 모든 인원이 참석할 수 있어요.";
      const first = exceptionRanges[0];
      if (first) {
        comment = `다만 ${formatKoreanTimeRange(first.startAt, first.endAt)}에는 ${formatNameList(
          first.names,
        )}이 참석하기 어려워요.`;
      }
    } else {
      headline = "이 날은 모든 인원이 맞는 시간이 없어요.";
      comment = allSlotsRequiredAvailable
        ? "그래도 필수참석자는 모든 시간에 참석할 수 있어요. 일부 선택참석자가 참석하기 어려워요."
        : "필수참석자가 모두 가능한 시간대를 먼저 확인하는 게 좋아요.";
    }

    // 미응답은 잠정 결과 수식어로만 붙인다(contextualResult 와 동일 원칙).
    if (pendingCount > 0) {
      headline = `아직 ${pendingCount}명이 응답하지 않아 잠정 결과예요. ${headline}`;
    }
  }

  return {
    date,
    totalSlots,
    allSlotsAllAvailable,
    allSlotsRequiredAvailable,
    allAvailableSlots,
    requiredIssueSlots,
    optionalIssueSlots,
    pendingSlots,
    bestSlot,
    headline,
    comment,
    exceptionRanges,
  };
}

/** 하루의 모든 후보 시간(generateSlots 규칙)을 평가해 날짜 요약을 만든다. */
export function summarizeDateAvailability(args: {
  date: string;
  durationMinutes: number;
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  participants: AvailabilityLookupParticipant[];
  blocks: AvailabilityLookupBlock[];
}): DateAvailabilitySummary {
  const slots = generateSlots({
    durationMinutes: args.durationMinutes,
    dateStart: args.date,
    dateEnd: args.date,
    workdayStart: args.workdayStart,
    workdayEnd: args.workdayEnd,
    lunchStart: args.lunchStart,
    lunchEnd: args.lunchEnd,
  });

  const results = slots.map((slot) =>
    lookupAvailabilityAtTime({
      participants: args.participants,
      blocks: args.blocks,
      startAt: slot.startAt,
      endAt: slot.endAt,
    }),
  );

  return buildDateAvailabilitySummary(args.date, results);
}
