import type { SlotCandidate } from "./types";

// 숫자 점수만 보여주지 않고, 사람이 이해할 수 있는 한국어 추천 이유를 생성한다.
// candidate 의 집계 값(reason 제외)을 받아 한 문단의 설명을 만든다.

type CandidateFacts = Omit<SlotCandidate, "reason" | "grade" | "score">;

export function explainRecommendation(c: CandidateFacts): string {
  const parts: string[] = [];
  const requiredPending = c.requiredTotalCount - c.requiredAvailableCount;

  // 1) 필수 참석자
  if (c.requiredTotalCount > 0 && c.requiredAllAvailable) {
    parts.push(`필수 참석자 ${c.requiredTotalCount}명이 모두 가능합니다`);
  } else if (c.requiredTotalCount > 0 && requiredPending > 0) {
    parts.push(`필수 참석자 ${requiredPending}명이 아직 응답하지 않았습니다`);
  } else {
    parts.push(`현재 응답을 기준으로 비교한 시간입니다`);
  }

  // 2) 선택 참석자
  if (c.optionalTotalCount > 0) {
    if (c.busyOptionalCount === 0) {
      parts.push(`선택 참석자 ${c.optionalAvailableCount}명도 참석할 수 있습니다`);
    } else {
      parts.push(`선택 참석자 ${c.busyOptionalCount}명은 참석이 어렵습니다`);
    }
  }

  // 3) 비선호 조건 (기존 데이터 호환)
  if (c.avoidConflictCount > 0) {
    parts.push(`비선호 조건 ${c.avoidConflictCount}건 때문에 우선순위를 약간 낮췄습니다`);
  }

  // 4) 선호
  if (c.preferredCount > 0) {
    parts.push(`${c.preferredCount}명이 이 시간을 선호합니다`);
  }

  // 5) 미응답 — 필수 미응답은 (1)에서 이미 언급했으므로 여기서는 선택 참석자 미응답만 센다.
  const optionalPending = c.pendingCount - requiredPending;
  if (optionalPending > 0) {
    parts.push(`아직 ${optionalPending}명이 응답하지 않아 변동 가능성이 있습니다`);
  }

  return parts.join(". ") + ".";
}
