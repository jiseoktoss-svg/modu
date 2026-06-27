import { isoToEpoch } from "@/lib/time";
import { generateSlots } from "./generateSlots";
import { scoreSlot } from "./scoreSlots";
import type { SchedulerInput, SlotCandidate } from "./types";

export * from "./types";
export * from "./validate";
export { generateSlots } from "./generateSlots";
export { scoreSlot } from "./scoreSlots";

const DEFAULT_MAX_CANDIDATES = 5;

/**
 * 추천 후보를 계산한다.
 * 1) 후보 슬롯 생성 → 2) 채점/제외 → 3) 정렬 → 4) 상위 N개.
 * '가장 추천'(best)은 최상위 1개에만 부여한다.
 */
export function recommendSlots(input: SchedulerInput): SlotCandidate[] {
  const max = input.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  const scored = generateSlots(input.meeting)
    .map((slot) => scoreSlot(slot, input))
    .filter((c): c is SlotCandidate => c !== null);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return isoToEpoch(a.startAt) - isoToEpoch(b.startAt);
  });

  const top = scored.slice(0, max);

  // '가장 추천'은 1개로 제한 — 나머지 동급은 '추천'으로 내린다.
  top.forEach((c, i) => {
    if (i > 0 && c.grade === "best") c.grade = "recommended";
  });

  return top;
}
