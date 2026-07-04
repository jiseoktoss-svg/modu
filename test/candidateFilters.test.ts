import { describe, expect, it } from "vitest";
import {
  CANDIDATE_FILTER_OPTIONS,
  rankGroupKindMatchesFilter,
  type CandidateFilter,
} from "@/lib/scheduler/candidateFilters";
import {
  classifyRankGroupKind,
  type EvaluatedSlot,
  type RankGroupKind,
} from "@/lib/scheduler/contextualResult";

// 추천안 후보 필터 — label 문자열이 아니라 RankGroupKind 로 판정한다.

function makeEval(over: {
  requiredBusyNames?: string[];
  optionalBusyNames?: string[];
  pendingNames?: string[];
}): EvaluatedSlot {
  const requiredTotal = 4;
  const optionalTotal = 2;
  const requiredBusyNames = over.requiredBusyNames ?? [];
  const optionalBusyNames = over.optionalBusyNames ?? [];
  const pendingNames = over.pendingNames ?? [];
  const totalParticipants = requiredTotal + optionalTotal;
  const requiredAvailable = requiredTotal - requiredBusyNames.length;
  const optionalAvailable = optionalTotal - optionalBusyNames.length - pendingNames.length;
  const totalAvailable = requiredAvailable + optionalAvailable;
  return {
    startAt: "2026-07-09T10:00:00+09:00",
    endAt: "2026-07-09T11:00:00+09:00",
    date: "2026-07-09",
    requiredTotal,
    optionalTotal,
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
}

describe("classifyRankGroupKind", () => {
  it("전원 가능 그룹은 allAvailable 이다", () => {
    expect(classifyRankGroupKind([makeEval({})])).toBe("allAvailable");
  });

  it("필수 전원 가능 + 선택 일부 불가는 requiredAvailable 이다", () => {
    expect(classifyRankGroupKind([makeEval({ optionalBusyNames: ["정우진"] })])).toBe(
      "requiredAvailable",
    );
  });

  it("필수 전원 가능이지만 미응답이 있으면 pendingBased 다", () => {
    expect(
      classifyRankGroupKind([
        makeEval({ optionalBusyNames: ["정우진"], pendingNames: ["한예린"] }),
      ]),
    ).toBe("pendingBased");
  });

  it("필수 1명 불가는 secondary, 2명 이상 불가는 avoid 다", () => {
    expect(classifyRankGroupKind([makeEval({ requiredBusyNames: ["김지훈"] })])).toBe("secondary");
    expect(
      classifyRankGroupKind([makeEval({ requiredBusyNames: ["김지훈", "이서연"] })]),
    ).toBe("avoid");
  });
});

describe("rankGroupKindMatchesFilter", () => {
  it("필터별 매칭 관계가 정확하다", () => {
    const kinds: RankGroupKind[] = [
      "allAvailable",
      "requiredAvailable",
      "pendingBased",
      "secondary",
      "avoid",
    ];

    // all 은 전부 포함.
    for (const kind of kinds) {
      expect(rankGroupKindMatchesFilter(kind, "all")).toBe(true);
    }

    expect(rankGroupKindMatchesFilter("allAvailable", "allAvailable")).toBe(true);
    expect(rankGroupKindMatchesFilter("requiredAvailable", "allAvailable")).toBe(false);

    // '필수참석자 가능'은 전원 가능(allAvailable)과 잠정(pendingBased) 그룹도 함께 보여준다
    // — 전원 가능이면 필수참석자도 당연히 가능하기 때문.
    expect(rankGroupKindMatchesFilter("requiredAvailable", "requiredAvailable")).toBe(true);
    expect(rankGroupKindMatchesFilter("pendingBased", "requiredAvailable")).toBe(true);
    expect(rankGroupKindMatchesFilter("allAvailable", "requiredAvailable")).toBe(true);

    expect(rankGroupKindMatchesFilter("secondary", "secondary")).toBe(true);
    expect(rankGroupKindMatchesFilter("avoid", "secondary")).toBe(false);

    expect(rankGroupKindMatchesFilter("avoid", "avoid")).toBe(true);
    expect(rankGroupKindMatchesFilter("secondary", "avoid")).toBe(false);
  });

  it("필터별 count 계산이 정확하다 (ResultScreen 과 동일한 방식)", () => {
    const groups: { kind: RankGroupKind; size: number }[] = [
      { kind: "allAvailable", size: 4 },
      { kind: "requiredAvailable", size: 2 },
      { kind: "pendingBased", size: 1 },
      { kind: "secondary", size: 2 },
      { kind: "avoid", size: 1 },
    ];

    const counts = {} as Record<CandidateFilter, number>;
    for (const option of CANDIDATE_FILTER_OPTIONS) {
      counts[option.value] = groups
        .filter((g) => rankGroupKindMatchesFilter(g.kind, option.value))
        .reduce((sum, g) => sum + g.size, 0);
    }

    expect(counts.all).toBe(10);
    expect(counts.allAvailable).toBe(4);
    expect(counts.requiredAvailable).toBe(7); // allAvailable + requiredAvailable + pendingBased
    expect(counts.secondary).toBe(2);
    expect(counts.avoid).toBe(1);
  });
});
