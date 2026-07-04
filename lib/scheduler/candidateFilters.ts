// 추천안 후보 리스트 필터 — rankGroups 를 그룹별로 나눠 보는 탐색 보조 기능.
// label 문자열이 아니라 RankGroupKind 로 판정해, 문구가 바뀌어도 필터가 깨지지 않는다.
// 투표/확정 기능이 아니다.

import type { RankGroupKind } from "./contextualResult";

export type CandidateFilter =
  | "all"
  | "allAvailable"
  | "requiredAvailable"
  | "secondary"
  | "avoid";

export const CANDIDATE_FILTER_OPTIONS: { value: CandidateFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "allAvailable", label: "모두 가능" },
  { value: "requiredAvailable", label: "필수 가능" },
  { value: "secondary", label: "차선" },
  { value: "avoid", label: "피하는 시간" },
];

/** 그룹 kind 가 필터에 포함되는지. '필수 가능'은 잠정(pendingBased) 그룹도 함께 보여준다. */
export function rankGroupKindMatchesFilter(
  kind: RankGroupKind,
  filter: CandidateFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "allAvailable") return kind === "allAvailable";
  if (filter === "requiredAvailable") {
    return kind === "requiredAvailable" || kind === "pendingBased";
  }
  if (filter === "secondary") return kind === "secondary";
  return kind === "avoid";
}
