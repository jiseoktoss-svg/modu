// 맥락형 추천 해석 레이어.
// 기존 추천 엔진(recommendSlots)은 건드리지 않고, 그 위에서 "전체 상황을 해석한 뒤
// 사용자가 실제로 판단해야 하는 정보만 강조"하는 화면용 결과 모델을 만든다.
// modu 는 회의 시간을 확정하지 않는다 — 이 레이어의 출력은 전부 '판단 보조' 정보이고,
// 최종 회의 시간은 참여자들이 추천안을 보고 제품 밖에서 정한다.
//
//   EvaluatedSlot[] → classifyContext → groupMeaningfulRanks → pickRecommendedSlots
//                   → buildCalendarMarks / buildNarrative → ContextualScheduleResult
//
// 원칙:
// - 색은 순위가 아니라 신호다. 캘린더 화면은 피하는 게 좋은 날만 색으로 노출하고,
//   내부 recommended 톤은 추천안 문맥을 위한 메타데이터로만 둔다. 빨강 = 이 후보군에서 피하는 게 좋은 시간(필수참석자 불가 같은 절대적 위험 +
//   전원 가능한 날이 충분한데 굳이 인원이 빠지는 날을 고를 이유가 없는 상대적 비추천),
//   나머지 중립.
// - 같은 조건의 후보는 같은 그룹으로 묶어 무의미한 1·2·3순위 구분을 없앤다.
// - 미응답(pending)은 컨텍스트가 아니라 문구 수식어로만 다룬다.
// - 필수참석자가 빠지는 슬롯도 버리지 않고 평가에 남긴다(경고 문구의 재료).

import { formatKoreanTime, isoToEpoch, kstWallToIso, parseHm } from "@/lib/time";
import { generateSlots } from "./generateSlots";
import type {
  AvailabilityLookupBlock,
  AvailabilityLookupParticipant,
} from "./availabilityLookup";
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
  reason?: string;
};

export type ContextualWarning = {
  startAt: string;
  endAt: string;
  date: string;
  names: string[];
  message: string;
  level: "soft" | "hard";
  /** 모든 날에 같은 시간대가 반복되면 하나로 묶은 경고("매일 …"). */
  everyDay?: boolean;
};

/** 경고를 '실제 busy 시각'으로 만들기 위한 원본 데이터. 없으면 경고를 만들지 않는다.
 *  블록 시각은 KST(+09:00) 벽시계 ISO 를 가정한다(데모 스냅샷·kstWallToIso 산출물). */
export type WarningDetail = {
  blocks: AvailabilityLookupBlock[];
  participants: AvailabilityLookupParticipant[];
  workdayStart: string;
  workdayEnd: string;
};

/** 그룹의 안정적인 분류 — UI 필터가 label 문자열에 의존하지 않게 한다. */
export type RankGroupKind =
  | "allAvailable"
  | "requiredAvailable"
  | "pendingBased"
  | "secondary"
  | "avoid";

export type RankGroup = {
  kind: RankGroupKind;
  label: string;
  slots: EvaluatedSlot[];
};

export type ContextualScheduleResult = {
  context: ScheduleContext;

  hasPending: boolean;
  pendingNames: string[];

  headline: string;
  comment: string;
  /** 코멘트에서 '등'으로 생략된 나머지 날짜(마우스 호버 툴팁용). 생략이 없으면 undefined. */
  overflowDates?: string[];

  rankGroups: RankGroup[];
  calendarMarks: CalendarMark[];
  warnings: ContextualWarning[];
};

// ---- 임계값(데모 케이스를 돌려보며 조정한다) ----

/** 전 인원이 참석할 수 있는 슬롯이 이 비율 이상이면 '대부분 가능'으로 본다. */
export const MOSTLY_AVAILABLE_RATIO = 0.6;
/** 필수참석자가 모두 가능한 슬롯이 이 비율 이하면 '바쁜 기간'으로 본다. */
export const SPARSE_RECOMMENDABLE_RATIO = 0.15;
/** 최고 그룹이 이 비율 이상으로 흔하면 추천 신호로 다루지 않는다(특별한 신호가 아님). */
export const TOP_GROUP_TOO_COMMON_RATIO = 0.5;
/** normal: 최상위 후보보다 참석 가능 인원이 이만큼 적으면 상대적으로 피하는 후보다.
 *  (선택참석자 1명 차이 정도는 중립으로 둔다 — 항상 빨갛게 칠하면 과하다.) */
export const RELATIVE_AVOID_GAP_NORMAL = 2;
/** busyPeriod: 상대적 빨강 기준(보수적으로 normal 과 같은 값에서 시작해 조정). */
export const RELATIVE_AVOID_GAP_BUSY = 2;
/** busyPeriod: 빨강이 전체 후보에서 차지할 수 있는 최대 비율(화면 도배 방지). */
export const MAX_RELATIVE_RED_RATIO = 0.35;

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
  const topSlot = [...slots].sort(compareSlots)[0];

  if (allAvailableRatio >= MOSTLY_AVAILABLE_RATIO) {
    return "mostlyAvailable";
  }

  // 최선 후보조차 필수참석자가 2명 이상 빠지면 이 기간은 회의 잡기에 부적합하다.
  if (topSlot.requiredBusyCount >= 2) {
    return "noGoodOption";
  }

  // 필수참석자가 모두 가능한 시간이 아주 적거나, 최선 후보조차 필수 1명이 빠지면 바쁜 기간.
  if (requiredSafeRatio <= SPARSE_RECOMMENDABLE_RATIO || topSlot.requiredBusyCount === 1) {
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

/** labelRankGroup 과 같은 분기 기준으로 그룹의 stable kind 를 정한다. */
export function classifyRankGroupKind(group: EvaluatedSlot[]): RankGroupKind {
  const first = group[0];
  if (first.isAllAvailable) return "allAvailable";
  if (first.isRequiredAllAvailable) {
    return first.pendingNames.length > 0 ? "pendingBased" : "requiredAvailable";
  }
  if (first.requiredBusyCount === 1) return "secondary";
  return "avoid";
}

export function labelRankGroup(group: EvaluatedSlot[]): string {
  const first = group[0];
  if (first.isAllAvailable) {
    return group.length > 1 ? "모두 참석할 수 있는 날짜" : "가장 무난한 날짜";
  }
  if (first.isRequiredAllAvailable) {
    // 미응답자가 있으면 '필수참석자가 모두 가능'은 과장이다(필수 미응답이 섞여 있을 수 있음).
    if (first.pendingNames.length > 0) {
      return "지금까지의 응답 기준 추천 날짜";
    }
    return group.length > 1 ? "필수참석자가 모두 가능한 날짜" : "추천 날짜";
  }
  if (first.requiredBusyCount === 1) {
    return "차선 날짜";
  }
  return "피하는 게 좋은 시간";
}

// ---- 추천 신호 선택 ----

export function pickRecommendedSlots(
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

  // 바쁜 기간에는 최선 후보 1~2개만 추천 신호로 남긴다 — 단, 필수참석자가 모두 가능한
  // 후보에만 쓴다. 필수가 빠지는 차선 후보는 문구(차선/경고)로 설명한다.
  if (context === "busyPeriod") {
    return topGroup.filter((slot) => slot.requiredBusyCount === 0).slice(0, 2);
  }

  // 최고 그룹이 너무 흔하면 특별한 추천 신호가 아니므로 칠하지 않는다.
  if (topGroup.length / allSlots.length >= TOP_GROUP_TOO_COMMON_RATIO) return [];

  return topGroup;
}

// ---- 빨간색(피하는 게 좋은 신호) 선택 ----
// 빨강 = "이 후보군 안에서는 굳이 고르지 않는 게 좋은 시간".
// 절대 기준(필수참석자 불가)과 상대 기준(후보군 대비 참석 인원 부족)을 함께 본다.
// 단, 후보가 전반적으로 나쁜 상황에서는 가장 나은 후보를 빨갛게 칠하지 않도록
// 컨텍스트별로 기준을 달리한다.

/** busyPeriod 에서 빨강이 화면을 도배하지 않도록 심각한 순서로 상한을 건다. */
function limitRedSlots(slots: EvaluatedSlot[], totalCount: number): EvaluatedSlot[] {
  const maxCount = Math.max(1, Math.floor(totalCount * MAX_RELATIVE_RED_RATIO));
  return [...slots].sort(compareAvoidSlots).slice(0, maxCount);
}

function uniqueSlots(slots: EvaluatedSlot[]): EvaluatedSlot[] {
  const seen = new Set<string>();
  const unique: EvaluatedSlot[] = [];

  for (const slot of slots) {
    const key = `${slot.startAt}|${slot.endAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(slot);
  }

  return unique;
}

export function pickRedSlots(
  context: ScheduleContext,
  // pickRecommendedSlots 와 시그니처를 맞추기 위한 자리 — 현재 로직은 그룹을 쓰지 않는다.
  _groups: EvaluatedSlot[][],
  allSlots: EvaluatedSlot[],
): EvaluatedSlot[] {
  if (allSlots.length === 0) return [];

  const best = [...allSlots].sort(compareSlots)[0];
  const bestAvailable = best.totalAvailable;
  const requiredRiskSlots = allSlots.filter((slot) => slot.requiredBusyCount >= 1);

  // 전원 가능한 날이 충분히 많다: 인원이 빠지는 날은 굳이 고를 이유가 없다 → 전부 빨강.
  if (context === "mostlyAvailable") {
    return allSlots.filter((slot) => {
      if (slot.requiredBusyCount >= 1) return true;
      return slot.totalAvailable < slot.totalParticipants;
    });
  }

  // 좋은 후보와 덜 좋은 후보가 섞여 있다: 필수 불가는 빨강, 상대 기준은
  // 최상위 대비 참석 인원 차이가 일정 이상일 때만(선택 1명 차이는 중립).
  if (context === "normal") {
    return allSlots.filter((slot) => {
      if (slot.requiredBusyCount >= 1) return true;
      return bestAvailable - slot.totalAvailable >= RELATIVE_AVOID_GAP_NORMAL;
    });
  }

  // 다들 바쁜 기간: 필수참석자가 빠지는 후보는 컨텍스트와 무관하게 피하는 신호로 남긴다.
  // 선택참석자만 빠지는 상대적 빨강은 화면 도배를 막기 위해 제한한다.
  if (context === "busyPeriod") {
    const relativeRedCandidates = allSlots.filter(
      (slot) =>
        slot.requiredBusyCount === 0 &&
        bestAvailable - slot.totalAvailable >= RELATIVE_AVOID_GAP_BUSY,
    );
    return uniqueSlots([
      ...requiredRiskSlots,
      ...limitRedSlots(relativeRedCandidates, allSlots.length),
    ]);
  }

  // 좋은 후보가 없는 기간이어도 필수참석자가 빠지는 후보는 피하는 날로 표시한다.
  return requiredRiskSlots;
}

// ---- 슬롯 → 날짜 집계 ----

/** 날짜 전체 빨강은 그날의 모든 후보 슬롯이 hard avoid 일 때만 — 특정 시간만 나쁜 날을 통째로 빨갛게 칠하지 않는다. */
export function shouldMarkDateAvoid(daySlots: EvaluatedSlot[]): boolean {
  return daySlots.length > 0 && daySlots.every((slot) => slot.isHardAvoid);
}

/** avoid 톤의 이유 — 절대적 위험(필수 불가)과 상대적 비추천(인원 부족)을 구분해 말한다. */
function buildAvoidReason(slot: EvaluatedSlot): string {
  if (slot.requiredBusyCount >= 2) {
    return "필수참석자 여러 명이 참석하기 어려워요.";
  }
  if (slot.requiredBusyCount === 1) {
    return "필수참석자 1명이 참석하기 어려워요.";
  }
  if (slot.totalAvailable < slot.totalParticipants) {
    return "다른 날짜보다 참석할 수 있는 인원이 적어요.";
  }
  return "이번 날짜 중에서는 우선순위가 낮은 시간이에요.";
}

export function buildCalendarMarks(
  slots: EvaluatedSlot[],
  recommendedSlots: EvaluatedSlot[],
  redSlots: EvaluatedSlot[],
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
      // 날짜 톤은 그날의 최선 슬롯 기준으로 정한다. 추천 신호가 피해야 할 신호보다 우선.
      const topSlotOfDay = [...daySlots].sort(compareSlots)[0];

      const isRecommendedDate = recommendedSlots.some(
        (slot) => slot.startAt === topSlotOfDay.startAt && slot.endAt === topSlotOfDay.endAt,
      );
      if (isRecommendedDate) {
        return {
          date,
          tone: "recommended" as const,
          reason: "이 날이 추천 날짜예요.",
        };
      }

      // 그날의 최선 슬롯이 빨강 후보이거나(상대적 비추천 포함),
      // 그날 모든 슬롯이 hard avoid 면 피하는 날이다.
      const isRelativeAvoidDate = redSlots.some(
        (slot) => slot.startAt === topSlotOfDay.startAt && slot.endAt === topSlotOfDay.endAt,
      );
      if (isRelativeAvoidDate || shouldMarkDateAvoid(daySlots)) {
        return {
          date,
          tone: "avoid" as const,
          reason: buildAvoidReason(topSlotOfDay),
        };
      }

      return { date, tone: "none" as const };
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

/** 필수참석자의 '실제 busy 시각'을 경고로 만든다. 후보 슬롯 병합이 아니라 실제 불가 블록을
 *  근무시간으로 클램프해 시각 그대로 쓴다(날짜·시간 검색과 일치). 모든 날에 같은 시간대(같은
 *  사람)가 반복되면 "매일 …" 한 줄로 묶는다. detail 이 없으면(순수 슬롯 테스트) 경고를 만들지 않는다. */
export function buildWarnings(
  slots: EvaluatedSlot[],
  detail?: WarningDetail,
): ContextualWarning[] {
  if (!detail) return [];
  const { blocks, participants, workdayStart, workdayEnd } = detail;

  const requiredIds = new Set(
    participants.filter((p) => p.attendanceType === "required").map((p) => p.id),
  );
  const nameById = new Map(participants.map((p) => [p.id, p.name] as const));
  const orderById = new Map(participants.map((p, i) => [p.id, i] as const));
  const workStartMin = parseHm(workdayStart);
  const workEndMin = parseHm(workdayEnd);
  const kstMin = (iso: string) => parseHm(iso.slice(11, 16));
  const hhmm = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  // 날짜별 필수 busy 블록을 근무시간으로 클램프해 모은다.
  const byDate = new Map<string, { id: string; s: number; e: number }[]>();
  for (const b of blocks) {
    if (b.status !== "busy" || !requiredIds.has(b.participantId)) continue;
    const s = Math.max(kstMin(b.startAt), workStartMin);
    const e = Math.min(kstMin(b.endAt), workEndMin);
    if (s >= e) continue;
    const date = b.startAt.slice(0, 10);
    const list = byDate.get(date) ?? [];
    list.push({ id: b.participantId, s, e });
    byDate.set(date, list);
  }

  // 날짜별로 '같은 필수 인원 집합이 불가한 실제 구간'을 세그먼트로 나눈다.
  type Interval = { date: string; startMin: number; endMin: number; ids: string[] };
  const intervals: Interval[] = [];
  for (const [date, list] of byDate) {
    const bounds = [...new Set(list.flatMap((x) => [x.s, x.e]))].sort((a, b) => a - b);
    let prev: Interval | null = null;
    for (let i = 0; i < bounds.length - 1; i++) {
      const s = bounds[i];
      const e = bounds[i + 1];
      const ids = list
        .filter((x) => x.s <= s && e <= x.e)
        .map((x) => x.id)
        .sort((a, b) => (orderById.get(a) ?? 0) - (orderById.get(b) ?? 0));
      if (ids.length === 0) {
        prev = null;
        continue;
      }
      if (prev && prev.ids.join("|") === ids.join("|") && prev.endMin === s) {
        prev.endMin = e;
      } else {
        prev = { date, startMin: s, endMin: e, ids };
        intervals.push(prev);
      }
    }
  }
  if (intervals.length === 0) return [];

  const totalDates = new Set(slots.map((s) => s.date)).size;

  // 같은 (필수 인원 집합, 시각)이면 날짜를 모아 '모든 날 반복'인지 판단한다.
  type Group = { ids: string[]; startMin: number; endMin: number; dates: Set<string> };
  const groups = new Map<string, Group>();
  for (const iv of intervals) {
    const key = `${iv.ids.join("|")}@${iv.startMin}-${iv.endMin}`;
    const g = groups.get(key);
    if (g) g.dates.add(iv.date);
    else
      groups.set(key, {
        ids: iv.ids,
        startMin: iv.startMin,
        endMin: iv.endMin,
        dates: new Set([iv.date]),
      });
  }

  const warnings: ContextualWarning[] = [];
  for (const g of groups.values()) {
    const names = g.ids.map((id) => nameById.get(id) ?? id);
    const level: "soft" | "hard" = g.ids.length >= 2 ? "hard" : "soft";
    const range = `${hhmm(g.startMin)}~${hhmm(g.endMin)}`;
    const everyDay = totalDates >= 2 && g.dates.size >= totalDates;
    if (everyDay) {
      const rep = [...g.dates].sort()[0];
      warnings.push({
        startAt: kstWallToIso(rep, g.startMin),
        endAt: kstWallToIso(rep, g.endMin),
        date: rep,
        names,
        level,
        everyDay: true,
        message: `매일 ${range}은 필수참석자인 ${formatNameList(names)}이 참석하기 어려워요. 이 시간은 피해주세요.`,
      });
    } else {
      for (const date of [...g.dates].sort()) {
        const [, m, d] = date.split("-").map(Number);
        warnings.push({
          startAt: kstWallToIso(date, g.startMin),
          endAt: kstWallToIso(date, g.endMin),
          date,
          names,
          level,
          message: `${m}월 ${d}일 ${range}에는 필수참석자인 ${formatNameList(names)}이 참석하기 어려워요. 이 시간은 피해주세요.`,
        });
      }
    }
  }

  // hard 먼저, 반복(매일) 먼저, 그다음 이른 시간 순.
  return warnings.sort((a, b) => {
    if (a.level !== b.level) return a.level === "hard" ? -1 : 1;
    if (!!a.everyDay !== !!b.everyDay) return a.everyDay ? -1 : 1;
    return isoToEpoch(a.startAt) - isoToEpoch(b.startAt);
  });
}

export function buildNarrative(args: {
  context: ScheduleContext;
  slots: EvaluatedSlot[];
  recommendedSlots: EvaluatedSlot[];
  redSlots: EvaluatedSlot[];
  warnings: ContextualWarning[];
  hasPending: boolean;
  pendingNames: string[];
}): { headline: string; comment: string; overflowDates?: string[] } {
  const { context, slots, recommendedSlots, redSlots, warnings, hasPending, pendingNames } = args;

  if (slots.length === 0) {
    return {
      headline: "아직 보여줄 날짜가 없어요.",
      comment: "회의 기간 안에 고를 수 있는 시간이 없어요. 기간을 확인해 주세요.",
    };
  }

  const best = [...slots].sort(compareSlots)[0];
  let headline = "";
  let comment = "";
  let overflowDates: string[] | undefined;

  if (context === "mostlyAvailable") {
    headline = "대부분 날짜에 모든 인원이 참석할 수 있어요.";
    const worst = warnings[0];
    if (worst && worst.everyDay) {
      comment = `단, 매일 ${formatKoreanTime(worst.startAt)}~${formatKoreanTime(worst.endAt)}에는 필수참석자인 ${formatNameList(worst.names)}이 참석하기 어려우니 그 시간만 피하면 어느 날짜든 괜찮아요.`;
    } else if (worst) {
      const [, m, d] = worst.date.split("-").map(Number);
      comment = `단, ${m}월 ${d}일 ${formatKoreanTime(worst.startAt)}에는 필수참석자인 ${formatNameList(worst.names)}이 참석하기 어려우니 이 시간은 피해주세요.`;
    } else if (redSlots.length > 0) {
      // 필수 경고는 없지만 상대적 빨강(일부 인원이 빠지는 날)이 있는 경우 —
      // 날짜는 최대 3개까지만 언급하고 나머지는 캘린더가 보여준다.
      const redDates = [...new Set(redSlots.map((slot) => slot.date))].sort();
      const labels = redDates.slice(0, 3).map((date) => {
        const [, m, d] = date.split("-").map(Number);
        return `${m}월 ${d}일`;
      });
      const suffix = redDates.length > 3 ? " 등" : "";
      comment = `${labels.join(", ")}${suffix}은 일부 인원이 참석하기 어려워요. 전원이 가능한 다른 날짜를 먼저 보는 게 좋아요.`;
      // '등'에 마우스를 올리면 생략된 나머지 날짜를 툴팁으로 볼 수 있게 노출한다.
      if (redDates.length > 3) {
        overflowDates = redDates.slice(3).map((date) => {
          const [, m, d] = date.split("-").map(Number);
          return `${m}월 ${d}일`;
        });
      }
    } else {
      comment = "특별히 피해야 할 시간은 많지 않아요. 편한 시간을 골라도 괜찮아요.";
    }
  } else if (context === "normal") {
    const hasRelativeRed = redSlots.some((slot) => slot.requiredBusyCount === 0);
    if (warnings.length > 0) {
      // 필수참석자가 빠지는 날이 있으면 '피하면 좋은 날짜' 관점으로 안내한다(추천 문구 생략).
      headline = "피하면 좋은 날짜가 있어요.";
      comment = "빨간색으로 표시된 시간은 필수참석자가 참석하기 어려워 피하는 게 좋아요.";
    } else if (hasRelativeRed) {
      // 선택참석자만 빠지는 날도 캘린더에 빨강으로 표시되므로 같은 톤으로 안내한다.
      headline = "피하면 좋은 날짜가 있어요.";
      comment = "빨간색으로 표시된 시간은 다른 날짜보다 참석할 수 있는 인원이 적어요.";
    } else {
      // 피할 날짜가 딱히 없으면 기존 긍정 문구를 유지한다.
      headline = "몇 개의 좋은 날짜가 보여요.";
      comment =
        recommendedSlots.length > 0
          ? "추천 날짜 중에서 고르면 무난해요."
          : "날짜 대부분이 비슷하게 좋아요. 어느 시간을 골라도 무난해요.";
    }
  } else if (context === "busyPeriod") {
    headline = "이번 기간은 다들 바빠서 모든 인원이 맞는 시간이 많지 않아요.";
    if (best.isRequiredAllAvailable) {
      comment = `그래도 ${formatSlotTimeLabel(best)}이 가장 나은 날짜예요. 필수참석자는 모두 참석할 수 있고, 전체 ${best.totalParticipants}명 중 ${best.totalAvailable}명이 참석할 수 있어요.`;
    } else {
      comment = `아쉽지만 ${formatSlotTimeLabel(best)}이 가장 나은 차선 날짜예요. 다만 필수참석자인 ${formatNameList(best.requiredBusyNames)}이 참석하기 어려워요.`;
    }
  } else {
    headline = "이번 기간에는 필수참석자가 모두 참석할 수 있는 시간이 없어요.";
    comment = `기간을 조금 넓히는 게 좋아요. 아쉽지만 굳이 고르면 ${formatSlotTimeLabel(best)}이 가장 덜 어려운 날짜예요. 다만 필수참석자인 ${formatNameList(best.requiredBusyNames)}이 참석하기 어려워요.`;
  }

  // 미응답은 컨텍스트가 아니라 잠정 결과 수식어로만 붙인다.
  if (hasPending) {
    headline = `아직 ${pendingNames.length}명이 응답하지 않아 잠정 결과예요. ${headline}`;
  }

  return { headline, comment, overflowDates };
}

// ---- 최종 결과 ----

export function buildContextualScheduleResult(
  slots: EvaluatedSlot[],
  detail?: WarningDetail,
): ContextualScheduleResult {
  const context = classifyContext(slots);
  const groups = groupMeaningfulRanks(slots);
  const recommendedSlots = pickRecommendedSlots(context, groups, slots);
  const redSlots = pickRedSlots(context, groups, slots);
  const calendarMarks = buildCalendarMarks(slots, recommendedSlots, redSlots);
  const warnings = buildWarnings(slots, detail);

  const pendingNames = [...new Set(slots.flatMap((s) => s.pendingNames))];
  const hasPending = pendingNames.length > 0;

  const { headline, comment, overflowDates } = buildNarrative({
    context,
    slots,
    recommendedSlots,
    redSlots,
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
    overflowDates,
    rankGroups: groups.map((group) => ({
      kind: classifyRankGroupKind(group),
      label: labelRankGroup(group),
      slots: group,
    })),
    calendarMarks,
    warnings,
  };
}
