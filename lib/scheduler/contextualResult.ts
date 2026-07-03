// 맥락형 추천 해석 레이어.
// 기존 추천 엔진(recommendSlots)은 건드리지 않고, 그 위에서 "전체 상황을 해석한 뒤
// 사용자가 실제로 판단해야 하는 정보만 강조"하는 화면용 결과 모델을 만든다.
//
//   EvaluatedSlot[] → classifyContext → groupMeaningfulRanks → pickBlueSlots
//                   → buildCalendarMarks / buildNarrative → ContextualScheduleResult
//
// 원칙:
// - 색은 순위가 아니라 신호다. 파랑 = 정말 추천할 시간, 빨강 = 정말 피해야 할 시간, 나머지 중립.
// - 같은 조건의 후보는 같은 그룹으로 묶어 무의미한 1·2·3순위 구분을 없앤다.
// - 미응답(pending)은 컨텍스트가 아니라 문구 수식어로만 다룬다.
// - 필수참석자가 빠지는 슬롯도 버리지 않고 평가에 남긴다(경고 문구의 재료).

import { formatKoreanTime, isoToEpoch } from "@/lib/time";
import { generateSlots } from "./generateSlots";
import type { SchedulerInput } from "./types";

// ---- 타입 ----

export type EvaluatedSlot = {
  startAt: string; // ISO (+09:00)
  endAt: string; // ISO (+09:00)
  date: string; // KST YYYY-MM-DD

  requiredTotal: number;
  optionalTotal: number;
  totalParticipants: number;

  requiredAvailable: number;
  optionalAvailable: number;
  totalAvailable: number;

  requiredBusyCount: number;
  optionalBusyCount: number;
  totalBusyCount: number;

  requiredBusyNames: string[];
  optionalBusyNames: string[];
  pendingNames: string[];

  isAllAvailable: boolean;
  /** 필수참석자 중 불가(busy)가 없다. 미응답은 별도(pendingNames)로 다룬다. */
  isRequiredAllAvailable: boolean;

  /** 필수참석자 1명 불가 — 날짜 배경 대신 문구 경고에 주로 쓴다. */
  isSoftAvoid: boolean;
  /** 필수참석자 2명 이상 불가 — 정말 피해야 할 시간. */
  isHardAvoid: boolean;
};

export type ScheduleContext =
  | "mostlyAvailable"
  | "normal"
  | "busyPeriod"
  | "noGoodOption";

export type CalendarTone = "none" | "recommended" | "avoid";

export type CalendarMark = {
  date: string;
  tone: CalendarTone;
  representativeSlot?: EvaluatedSlot;
  reason?: string;
};

export type ContextualWarning = {
  startAt: string;
  endAt: string;
  date: string;
  names: string[];
  message: string;
  level: "soft" | "hard";
};

export type RankGroup = {
  label: string;
  slots: EvaluatedSlot[];
};

export type ContextualScheduleResult = {
  context: ScheduleContext;

  hasPending: boolean;
  pendingNames: string[];

  headline: string;
  comment: string;

  rankGroups: RankGroup[];
  calendarMarks: CalendarMark[];
  warnings: ContextualWarning[];
};

// ---- 임계값(케이스 1~8을 돌려보며 조정한다) ----

/** 전 인원이 참석할 수 있는 슬롯이 이 비율 이상이면 '대부분 가능'으로 본다. */
export const MOSTLY_AVAILABLE_RATIO = 0.6;
/** 필수참석자가 모두 가능한 슬롯이 이 비율 이하면 '바쁜 기간'으로 본다. */
export const SPARSE_RECOMMENDABLE_RATIO = 0.15;
/** 최고 그룹이 이 비율 이상으로 흔하면 파랑을 칠하지 않는다(특별한 신호가 아님). */
export const TOP_GROUP_TOO_COMMON_RATIO = 0.5;

// ---- 평가: 실제 엔진 입력 → 전체 슬롯 평가 ----
// recommendSlots 와 달리 필수참석자가 빠지는 슬롯도 버리지 않고 남긴다.

export function evaluateAllSlots(input: SchedulerInput): EvaluatedSlot[] {
  const required = input.participants.filter((p) => p.attendanceType === "required");
  const optional = input.participants.filter((p) => p.attendanceType === "optional");
  const pendingNames = input.participants
    .filter((p) => p.responseStatus !== "submitted")
    .map((p) => p.name);
  const submittedIds = new Set(
    input.participants.filter((p) => p.responseStatus === "submitted").map((p) => p.id),
  );
  const busyBlocks = input.blocks.filter((b) => b.status === "busy");

  return generateSlots(input.meeting).map((slot) => {
    const s = isoToEpoch(slot.startAt);
    const e = isoToEpoch(slot.endAt);
    const busyIds = new Set(
      busyBlocks
        .filter(
          (b) =>
            submittedIds.has(b.participantId) &&
            isoToEpoch(b.startAt) < e &&
            s < isoToEpoch(b.endAt),
        )
        .map((b) => b.participantId),
    );

    const requiredBusyNames = required.filter((p) => busyIds.has(p.id)).map((p) => p.name);
    const optionalBusyNames = optional.filter((p) => busyIds.has(p.id)).map((p) => p.name);
    const requiredPendingCount = required.filter((p) => p.responseStatus !== "submitted").length;
    const optionalPendingCount = optional.filter((p) => p.responseStatus !== "submitted").length;

    const requiredAvailable = required.length - requiredBusyNames.length - requiredPendingCount;
    const optionalAvailable = optional.length - optionalBusyNames.length - optionalPendingCount;
    const totalParticipants = input.participants.length;
    const totalAvailable = requiredAvailable + optionalAvailable;

    return {
      startAt: slot.startAt,
      endAt: slot.endAt,
      // 슬롯 ISO 는 kstWallToIso 산출(+09:00 고정)이라 앞 10자가 KST 날짜다.
      date: slot.startAt.slice(0, 10),

      requiredTotal: required.length,
      optionalTotal: optional.length,
      totalParticipants,

      requiredAvailable,
      optionalAvailable,
      totalAvailable,

      requiredBusyCount: requiredBusyNames.length,
      optionalBusyCount: optionalBusyNames.length,
      totalBusyCount: requiredBusyNames.length + optionalBusyNames.length,

      requiredBusyNames,
      optionalBusyNames,
      pendingNames,

      isAllAvailable: totalAvailable === totalParticipants,
      isRequiredAllAvailable: requiredBusyNames.length === 0,
      isSoftAvoid: requiredBusyNames.length === 1,
      isHardAvoid: requiredBusyNames.length >= 2,
    };
  });
}

// ---- 정렬 ----

export function compareSlots(a: EvaluatedSlot, b: EvaluatedSlot): number {
  // 1. 필수참석자 불가가 적은 후보 우선
  if (a.requiredBusyCount !== b.requiredBusyCount) {
    return a.requiredBusyCount - b.requiredBusyCount;
  }
  // 2. 전체 참석 가능 인원이 많은 후보 우선
  if (a.totalAvailable !== b.totalAvailable) {
    return b.totalAvailable - a.totalAvailable;
  }
  // 3. 선택참석자 불가가 적은 후보 우선
  if (a.optionalBusyCount !== b.optionalBusyCount) {
    return a.optionalBusyCount - b.optionalBusyCount;
  }
  // 4. 빠른 날짜·시간 우선
  return isoToEpoch(a.startAt) - isoToEpoch(b.startAt);
}

/** 피해야 할 슬롯 정렬 — 필수 불가가 많은(심각한) 시간부터. */
export function compareAvoidSlots(a: EvaluatedSlot, b: EvaluatedSlot): number {
  if (a.requiredBusyCount !== b.requiredBusyCount) {
    return b.requiredBusyCount - a.requiredBusyCount;
  }
  if (a.totalBusyCount !== b.totalBusyCount) {
    return b.totalBusyCount - a.totalBusyCount;
  }
  return isoToEpoch(a.startAt) - isoToEpoch(b.startAt);
}

// ---- 컨텍스트 분류 ----

export function classifyContext(slots: EvaluatedSlot[]): ScheduleContext {
  const total = slots.length;
  if (total === 0) return "noGoodOption";

  const allAvailableRatio = slots.filter((s) => s.isAllAvailable).length / total;
  const requiredSafeRatio = slots.filter((s) => s.isRequiredAllAvailable).length / total;
  const bestSlot = [...slots].sort(compareSlots)[0];

  if (allAvailableRatio >= MOSTLY_AVAILABLE_RATIO) {
    return "mostlyAvailable";
  }

  // 최선 후보조차 필수참석자가 2명 이상 빠지면 이 기간은 회의 잡기에 부적합하다.
  if (bestSlot.requiredBusyCount >= 2) {
    return "noGoodOption";
  }

  // 필수참석자가 모두 가능한 시간이 아주 적거나, 최선 후보조차 필수 1명이 빠지면 바쁜 기간.
  if (requiredSafeRatio <= SPARSE_RECOMMENDABLE_RATIO || bestSlot.requiredBusyCount === 1) {
    return "busyPeriod";
  }

  return "normal";
}

// ---- 무의미한 순위 그룹화 ----
// 명시적인 시그널(필수/선택 불가 수·가능 인원·미응답 수)이 같으면 같은 그룹으로 묶는다.

export function rankSignature(slot: EvaluatedSlot): string {
  return [
    slot.requiredBusyCount,
    slot.optionalBusyCount,
    slot.totalAvailable,
    slot.pendingNames.length,
  ].join("|");
}

export function groupMeaningfulRanks(slots: EvaluatedSlot[]): EvaluatedSlot[][] {
  const sorted = [...slots].sort(compareSlots);
  const groups: EvaluatedSlot[][] = [];

  for (const slot of sorted) {
    const last = groups.at(-1);
    if (!last) {
      groups.push([slot]);
      continue;
    }
    if (rankSignature(last[0]) === rankSignature(slot)) {
      last.push(slot);
    } else {
      groups.push([slot]);
    }
  }

  return groups;
}

export function labelRankGroup(group: EvaluatedSlot[]): string {
  const first = group[0];
  if (first.isAllAvailable) {
    return group.length > 1 ? "모두 참석할 수 있는 후보" : "가장 무난한 후보";
  }
  if (first.isRequiredAllAvailable) {
    return group.length > 1 ? "필수참석자가 모두 가능한 후보" : "추천 후보";
  }
  if (first.requiredBusyCount === 1) {
    return "차선 후보";
  }
  return "피하는 게 좋은 시간";
}

// ---- 파란색(추천 신호) 선택 ----

export function pickBlueSlots(
  context: ScheduleContext,
  groups: EvaluatedSlot[][],
  allSlots: EvaluatedSlot[],
): EvaluatedSlot[] {
  const topGroup = groups[0] ?? [];
  if (topGroup.length === 0 || allSlots.length === 0) return [];

  // 대부분 다 좋은 상황: 특정 추천보다 피해야 할 예외만 알면 된다.
  if (context === "mostlyAvailable") return [];

  // 좋은 후보가 아예 없으면 '추천'이 아니라 '차선/기간 조정' 문구가 중심이다.
  if (context === "noGoodOption") return [];

  // 바쁜 기간에는 최선 후보 1~2개만 강조한다.
  if (context === "busyPeriod") return topGroup.slice(0, 2);

  // 최고 그룹이 너무 흔하면 특별한 추천 신호가 아니므로 칠하지 않는다.
  if (topGroup.length / allSlots.length >= TOP_GROUP_TOO_COMMON_RATIO) return [];

  return topGroup;
}

// ---- 슬롯 → 날짜 집계 ----

/** 날짜 전체 빨강은 그날의 모든 후보 슬롯이 hard avoid 일 때만 — 특정 시간만 나쁜 날을 통째로 빨갛게 칠하지 않는다. */
export function shouldMarkDateAvoid(daySlots: EvaluatedSlot[]): boolean {
  return daySlots.length > 0 && daySlots.every((slot) => slot.isHardAvoid);
}

export function buildCalendarMarks(
  slots: EvaluatedSlot[],
  blueSlots: EvaluatedSlot[],
): CalendarMark[] {
  const byDate = new Map<string, EvaluatedSlot[]>();
  for (const slot of slots) {
    const list = byDate.get(slot.date) ?? [];
    list.push(slot);
    byDate.set(slot.date, list);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, daySlots]) => {
      // 날짜 톤은 그날의 최선 슬롯 기준으로 정한다.
      const bestSlotOfDay = [...daySlots].sort(compareSlots)[0];

      const isRecommendedDate = blueSlots.some(
        (slot) => slot.startAt === bestSlotOfDay.startAt && slot.endAt === bestSlotOfDay.endAt,
      );
      if (isRecommendedDate) {
        return {
          date,
          tone: "recommended" as const,
          representativeSlot: bestSlotOfDay,
          reason: "이 날의 가장 좋은 시간이 추천 후보예요.",
        };
      }

      if (shouldMarkDateAvoid(daySlots)) {
        return {
          date,
          tone: "avoid" as const,
          representativeSlot: bestSlotOfDay,
          reason: "이 날은 어느 시간을 골라도 필수참석자가 참석하기 어려워요.",
        };
      }

      return { date, tone: "none" as const, representativeSlot: bestSlotOfDay };
    });
}

// ---- 문구 ----

/** "7월 16일 15:00" — 확인/안내 화면과 같이 년도 없이 표기한다. */
function formatSlotTimeLabel(slot: EvaluatedSlot): string {
  const [, m, d] = slot.date.split("-").map(Number);
  return `${m}월 ${d}일 ${formatKoreanTime(slot.startAt)}`;
}

/** "김지훈님" / "김지훈님과 이서연님" / 3명 이상은 쉼표 나열. */
function formatNameList(names: string[]): string {
  const honored = names.map((n) => `${n}님`);
  if (honored.length <= 1) return honored.join("");
  if (honored.length === 2) return `${honored[0]}과 ${honored[1]}`;
  return honored.join(", ");
}

/** 필수참석자가 빠지는 슬롯들을 경고로 변환한다. 같은 날짜·같은 명단·같은 수위의
 *  연속(인접·겹침) 슬롯은 하나의 시간대 경고로 합친다(실데이터의 30분 슬롯 나열 방지). */
export function buildWarnings(slots: EvaluatedSlot[]): ContextualWarning[] {
  const avoidSlots = slots
    .filter((s) => s.requiredBusyCount >= 1)
    .sort((a, b) => isoToEpoch(a.startAt) - isoToEpoch(b.startAt));

  type Merged = {
    startAt: string;
    endAt: string;
    date: string;
    names: string[];
    level: "soft" | "hard";
  };
  const merged: Merged[] = [];
  for (const slot of avoidSlots) {
    const level: "soft" | "hard" = slot.isHardAvoid ? "hard" : "soft";
    const namesKey = slot.requiredBusyNames.join("|");
    const last = merged.at(-1);
    if (
      last &&
      last.date === slot.date &&
      last.level === level &&
      last.names.join("|") === namesKey &&
      isoToEpoch(slot.startAt) <= isoToEpoch(last.endAt)
    ) {
      if (isoToEpoch(slot.endAt) > isoToEpoch(last.endAt)) last.endAt = slot.endAt;
    } else {
      merged.push({
        startAt: slot.startAt,
        endAt: slot.endAt,
        date: slot.date,
        names: slot.requiredBusyNames,
        level,
      });
    }
  }

  return merged
    .map((w) => {
      const [, m, d] = w.date.split("-").map(Number);
      const start = formatKoreanTime(w.startAt);
      const end = formatKoreanTime(w.endAt);
      const label =
        isoToEpoch(w.endAt) - isoToEpoch(w.startAt) > 60 * 60000
          ? `${m}월 ${d}일 ${start}~${end}`
          : `${m}월 ${d}일 ${start}`;
      return {
        ...w,
        message: `${label}에는 필수참석자인 ${formatNameList(w.names)}이 참석하기 어려워요. 이 시간은 피해주세요.`,
      };
    })
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === "hard" ? -1 : 1;
      return isoToEpoch(a.startAt) - isoToEpoch(b.startAt);
    });
}

export function buildNarrative(args: {
  context: ScheduleContext;
  slots: EvaluatedSlot[];
  blueSlots: EvaluatedSlot[];
  warnings: ContextualWarning[];
  hasPending: boolean;
  pendingNames: string[];
}): { headline: string; comment: string } {
  const { context, slots, blueSlots, warnings, hasPending, pendingNames } = args;

  if (slots.length === 0) {
    return {
      headline: "아직 보여줄 후보가 없어요.",
      comment: "회의 기간 안에 고를 수 있는 시간이 없어요. 기간을 확인해 주세요.",
    };
  }

  const best = [...slots].sort(compareSlots)[0];
  let headline = "";
  let comment = "";

  if (context === "mostlyAvailable") {
    headline = "대부분 날짜에 모든 인원이 참석할 수 있어요.";
    const worst = warnings[0];
    if (worst) {
      const [, m, d] = worst.date.split("-").map(Number);
      comment = `단, ${m}월 ${d}일 ${formatKoreanTime(worst.startAt)}에는 필수참석자인 ${formatNameList(worst.names)}이 참석하기 어려우니 이 시간은 피해주세요.`;
    } else {
      comment = "특별히 피해야 할 시간은 많지 않아요. 편한 시간을 골라도 괜찮아요.";
    }
  } else if (context === "normal") {
    headline = "몇 개의 좋은 후보가 보여요.";
    comment =
      blueSlots.length > 0
        ? "파란색으로 표시된 시간 중에서 고르면 무난해요."
        : "후보 대부분이 비슷하게 좋아요. 어느 시간을 골라도 무난해요.";
    if (warnings.length > 0) {
      comment += " 빨간색으로 표시된 시간은 필수참석자가 참석하기 어려워 피하는 게 좋아요.";
    }
  } else if (context === "busyPeriod") {
    headline = "이번 기간은 다들 바빠서 모든 인원이 맞는 시간이 많지 않아요.";
    if (best.isRequiredAllAvailable) {
      comment = `그래도 ${formatSlotTimeLabel(best)}이 가장 나은 후보예요. 필수참석자는 모두 참석할 수 있고, 전체 ${best.totalParticipants}명 중 ${best.totalAvailable}명이 참석할 수 있어요.`;
    } else {
      comment = `아쉽지만 ${formatSlotTimeLabel(best)}이 가장 나은 차선 후보예요. 다만 필수참석자인 ${formatNameList(best.requiredBusyNames)}이 참석하기 어려워요.`;
    }
  } else {
    headline = "이번 기간에는 필수참석자가 모두 참석할 수 있는 시간이 없어요.";
    comment = `기간을 조금 넓히는 게 좋아요. 아쉽지만 굳이 고르면 ${formatSlotTimeLabel(best)}이 가장 덜 어려운 후보예요. 다만 필수참석자인 ${formatNameList(best.requiredBusyNames)}이 참석하기 어려워요.`;
  }

  // 미응답은 컨텍스트가 아니라 잠정 결과 수식어로만 붙인다.
  if (hasPending) {
    headline = `아직 ${pendingNames.length}명이 응답하지 않아 잠정 결과예요. ${headline}`;
  }

  return { headline, comment };
}

// ---- 최종 결과 ----

export function buildContextualScheduleResult(slots: EvaluatedSlot[]): ContextualScheduleResult {
  const context = classifyContext(slots);
  const groups = groupMeaningfulRanks(slots);
  const blueSlots = pickBlueSlots(context, groups, slots);
  const calendarMarks = buildCalendarMarks(slots, blueSlots);
  const warnings = buildWarnings(slots);

  const pendingNames = [...new Set(slots.flatMap((s) => s.pendingNames))];
  const hasPending = pendingNames.length > 0;

  const { headline, comment } = buildNarrative({
    context,
    slots,
    blueSlots,
    warnings,
    hasPending,
    pendingNames,
  });

  return {
    context,
    hasPending,
    pendingNames,
    headline,
    comment,
    rankGroups: groups.map((group) => ({ label: labelRankGroup(group), slots: group })),
    calendarMarks,
    warnings,
  };
}
