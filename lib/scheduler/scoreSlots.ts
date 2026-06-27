import { getKstParts, isoToEpoch, parseHm } from "@/lib/time";
import { explainRecommendation } from "./explainRecommendation";
import type { RawSlot } from "./generateSlots";
import type {
  ImpactStatus,
  ParticipantImpact,
  RecommendationGrade,
  SchedulerInput,
  SlotCandidate,
} from "./types";

// 점수 상수 — 모두 명시적으로 두어 설명/테스트가 가능하게 한다.
export const SCORE_BASE = 100;
export const PENALTY_OPTIONAL_BUSY = 15; // 선택 참석자 1명 불가
export const PENALTY_AVOID = 8; // 비선호 1건
export const PENALTY_AFTER_LUNCH = 10; // 점심 직후
export const PENALTY_REQUIRED_PENDING = 12; // 필수인데 미응답 (불확실성)
export const BONUS_PREFERRED = 6; // 선호 1건

/** 점심 직후 회피 밴드(분). 기본은 점심 종료 후 1시간. (기본값 기준 13:00~14:00) */
function afterLunchBand(lunchEnd: number): [number, number] {
  return [lunchEnd, lunchEnd + 60];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** 한 참석자의 슬롯 내 지배 상태를 구한다. busy > avoid > preferred > available. */
function dominantStatus(
  statuses: Set<"busy" | "avoid" | "preferred">,
): Exclude<ImpactStatus, "pending"> {
  if (statuses.has("busy")) return "busy";
  if (statuses.has("avoid")) return "avoid";
  if (statuses.has("preferred")) return "preferred";
  return "available";
}

/**
 * 한 후보 슬롯을 채점한다.
 * - 필수 참석자의 busy 와 겹치면 후보에서 제외(null 반환).
 * - 그 외 조건은 감점/가점으로 반영.
 */
export function scoreSlot(slot: RawSlot, input: SchedulerInput): SlotCandidate | null {
  const slotStart = isoToEpoch(slot.startAt);
  const slotEnd = isoToEpoch(slot.endAt);

  // 참석자별 블록 묶음.
  const blocksByParticipant = new Map<string, Set<"busy" | "avoid" | "preferred">>();
  for (const block of input.blocks) {
    if (!overlaps(slotStart, slotEnd, isoToEpoch(block.startAt), isoToEpoch(block.endAt))) {
      continue;
    }
    let set = blocksByParticipant.get(block.participantId);
    if (!set) {
      set = new Set();
      blocksByParticipant.set(block.participantId, set);
    }
    set.add(block.status);
  }

  let requiredTotalCount = 0;
  let requiredAvailableCount = 0;
  let optionalTotalCount = 0;
  let optionalAvailableCount = 0;
  let busyOptionalCount = 0;
  let avoidConflictCount = 0;
  let preferredCount = 0;
  let pendingCount = 0;

  const impacts: ParticipantImpact[] = [];

  for (const p of input.participants) {
    const isRequired = p.attendanceType === "required";
    if (isRequired) requiredTotalCount += 1;
    else optionalTotalCount += 1;

    // 미응답자는 상태를 알 수 없다. 제외하지 않고 'pending' 으로 표시한다.
    if (p.responseStatus === "pending") {
      pendingCount += 1;
      impacts.push({
        participantId: p.id,
        name: p.name,
        attendanceType: p.attendanceType,
        status: "pending",
      });
      continue;
    }

    const status = dominantStatus(blocksByParticipant.get(p.id) ?? new Set());

    if (status === "busy") {
      // 필수 참석자가 불가능하면 후보 제외.
      if (isRequired) return null;
      busyOptionalCount += 1;
    } else {
      // available / avoid / preferred 는 모두 '참석 가능'으로 본다.
      if (isRequired) requiredAvailableCount += 1;
      else optionalAvailableCount += 1;
    }

    if (status === "avoid") avoidConflictCount += 1;
    if (status === "preferred") preferredCount += 1;

    impacts.push({
      participantId: p.id,
      name: p.name,
      attendanceType: p.attendanceType,
      status,
    });
  }

  // 점심 직후 여부 (KST 분 기준).
  const startMin = (() => {
    const kp = getKstParts(slot.startAt);
    return kp.hours * 60 + kp.minutes;
  })();
  const endMin = (() => {
    const kp = getKstParts(slot.endAt);
    return kp.hours * 60 + kp.minutes;
  })();
  const [bandStart, bandEnd] = afterLunchBand(parseHm(input.meeting.lunchEnd));
  const afterLunch = overlaps(startMin, endMin, bandStart, bandEnd);

  const requiredAllAvailable =
    requiredTotalCount === 0 || requiredAvailableCount === requiredTotalCount;
  const requiredPending = requiredTotalCount - requiredAvailableCount;

  // 점수 계산.
  let score = SCORE_BASE;
  score -= busyOptionalCount * PENALTY_OPTIONAL_BUSY;
  score -= avoidConflictCount * PENALTY_AVOID;
  score -= afterLunch ? PENALTY_AFTER_LUNCH : 0;
  score -= requiredPending * PENALTY_REQUIRED_PENDING;
  score += preferredCount * BONUS_PREFERRED;

  // 등급 결정.
  let grade: RecommendationGrade;
  if (!requiredAllAvailable) {
    grade = "caution"; // 필수 참석자 일부가 아직 불확실
  } else if (busyOptionalCount === 0 && avoidConflictCount === 0 && !afterLunch) {
    grade = "best";
  } else if (busyOptionalCount === 0 && avoidConflictCount <= 1) {
    grade = "recommended";
  } else if (busyOptionalCount <= 1) {
    grade = "conditional";
  } else {
    grade = "caution";
  }

  const facts = {
    startAt: slot.startAt,
    endAt: slot.endAt,
    requiredTotalCount,
    requiredAvailableCount,
    requiredAllAvailable,
    optionalTotalCount,
    optionalAvailableCount,
    busyOptionalCount,
    avoidConflictCount,
    preferredCount,
    afterLunch,
    pendingCount,
    hasPendingParticipants: pendingCount > 0,
    impacts,
  };

  return {
    ...facts,
    score,
    grade,
    reason: explainRecommendation(facts),
  };
}
