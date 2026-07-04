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

// secondary 그룹은 정의상 '필수참석자 1명 불가'라 라벨을 '필수 1명 어려움'으로 고정한다.
export const CANDIDATE_FILTER_OPTIONS: {
  value: CandidateFilter;
  label: string;
  /** 칩 title/aria-label 로 노출하는 설명. */
  description: string;
}[] = [
  { value: "all", label: "전체", description: "모든 후보를 봐요." },
  {
    value: "allAvailable",
    label: "모두 참석 가능",
    description: "모든 인원이 참석할 수 있는 후보만 봐요.",
  },
  {
    value: "requiredAvailable",
    label: "필수참석자 가능",
    description: "필수참석자가 모두 참석할 수 있는 후보를 봐요. 전원 가능 후보도 포함돼요.",
  },
  {
    value: "secondary",
    label: "필수 1명 어려움",
    description: "필수참석자 1명이 참석하기 어려운 차선 후보를 봐요.",
  },
  {
    value: "avoid",
    label: "피하면 좋음",
    description: "필수참석자 여러 명이 어려워 피하는 게 좋은 후보를 봐요.",
  },
];

/** 그룹 kind 가 필터에 포함되는지.
 *  '필수참석자 가능'은 사용자 직관에 맞게 전원 가능(allAvailable)과 잠정(pendingBased)
 *  그룹까지 포함한다 — 전원 가능이면 필수참석자도 당연히 가능하기 때문. */
export function rankGroupKindMatchesFilter(
  kind: RankGroupKind,
  filter: CandidateFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "allAvailable") return kind === "allAvailable";
  if (filter === "requiredAvailable") {
    return kind === "allAvailable" || kind === "requiredAvailable" || kind === "pendingBased";
  }
  if (filter === "secondary") return kind === "secondary";
  return kind === "avoid";
}
