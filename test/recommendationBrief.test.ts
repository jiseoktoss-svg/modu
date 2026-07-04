import { describe, expect, it } from "vitest";
import { buildRecommendationBrief } from "@/lib/scheduler/recommendationBrief";
import { buildContextualScheduleResult } from "@/lib/scheduler/contextualResult";
import { summarizeDateAvailability } from "@/lib/scheduler/dateAvailabilitySummary";
import { adaptDemoCaseToEvaluatedSlots } from "@/data/demoCaseAdapter";
import { buildCaseCandidates, buildCaseSnapshot, DEMO_CASES } from "@/data/demoCases";
import { addDaysToDateStr, todayDateStrKst } from "@/lib/time";

// 추천안 화면의 문장형 추천 요약 — 후보 카드 대신 modu 가 먼저 정리해주는 답변.
// 시나리오(케이스) 데이터를 화면과 동일한 방식으로 조립해 검증한다.

function upcomingWeekdays(count: number): string[] {
  const out: string[] = [];
  let cursor = todayDateStrKst();
  while (out.length < count) {
    cursor = addDaysToDateStr(cursor, 1);
    const [y, m, d] = cursor.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) out.push(cursor);
  }
  return out;
}

function briefForCase(id: number, days: number) {
  const demoCase = DEMO_CASES.find((c) => c.id === id);
  if (!demoCase) throw new Error(`demo case ${id} not found`);
  const dates = upcomingWeekdays(days);

  const contextual = buildContextualScheduleResult(
    adaptDemoCaseToEvaluatedSlots(demoCase, dates),
  );
  const snapshot = buildCaseSnapshot(demoCase, dates);
  const summaryDates = [...new Set(buildCaseCandidates(demoCase, dates).map((c) => c.date))].sort();
  const summaries = summaryDates.map((date) =>
    summarizeDateAvailability({
      date,
      durationMinutes: 60,
      workdayStart: "09:00",
      workdayEnd: "18:00",
      lunchStart: "00:00",
      lunchEnd: "00:01",
      participants: snapshot.participants,
      blocks: snapshot.blocks,
    }),
  );
  return buildRecommendationBrief({ contextual, summaries });
}

describe("buildRecommendationBrief", () => {
  it("1. 전원 가능 날짜가 적으면 시간 슬롯이 아니라 날짜를 직접 나열한다 (시나리오 1, 짧은 기간)", () => {
    const brief = briefForCase(1, 3);

    expect(brief.primarySentence).toContain("먼저 확인해보세요");
    expect(brief.primarySentence).toContain("회의 가능 시간대 전체");
    // 대표 슬롯 시간(10:00~11:00 등)을 노출하지 않는다.
    expect(brief.primarySentence).not.toMatch(/\d{2}:\d{2}/);
    expect(brief.primaryItems[0].tone).toBe("good");
  });

  it("2. 전원 가능 날짜가 여러 개면 먼저 볼 날짜는 최대 3개까지만 나온다 (시나리오 1)", () => {
    const brief = briefForCase(1, 8);

    expect(brief.primaryItems.length).toBeGreaterThanOrEqual(1);
    expect(brief.primaryItems.length).toBeLessThanOrEqual(3);
  });

  it("2-1. 전원 가능 날짜가 많으면 3개만 나열하지 않고 예외 중심으로 말한다 (시나리오 1, 넓은 기간)", () => {
    const brief = briefForCase(1, 8);

    // 예외 중심 문구 — "N월 N일만 제외하면, 대부분 날짜에 모든 인원이 참석할 수 있어요".
    expect(brief.primarySentence).toContain("제외하면");
    expect(brief.primarySentence).toContain("대부분 날짜에 모든 인원이 참석할 수 있어요");
    expect(brief.primarySentence).toMatch(/7월 \d+일만 제외하면/);
    // 3개 날짜만 '먼저 확인'하라고 말하지 않는다(나머지가 왜 빠졌는지 오해 방지).
    expect(brief.primarySentence).not.toContain("을 먼저 확인해보세요. 회의 가능 시간대 전체");
  });

  it("3. 피하면 좋은 날짜가 있으면 avoidSentence 에 나온다 (시나리오 2)", () => {
    const brief = briefForCase(2, 8);

    expect(brief.avoidItems.length).toBeGreaterThanOrEqual(1);
    expect(brief.avoidSentence).toBeDefined();
    expect(brief.avoidSentence).toContain("일부 인원이 참석하기 어려워");
    expect(brief.avoidSentence).toContain("다른 날짜를 먼저 보는 게 좋아요");
  });

  it("4. 점심 직후처럼 특정 시간대만 어려우면 예외 시간 문구가 나온다 (시나리오 5)", () => {
    const brief = briefForCase(5, 3);

    // 피할 '날짜'는 없지만 예외 '시간'이 있는 상황 — 시간대와 이름을 함께 알려준다.
    expect(brief.avoidSentence).toBeDefined();
    expect(brief.avoidSentence).toMatch(/\d{2}:\d{2}~\d{2}:\d{2}/);
    // 예외 범위는 겹치는 후보 슬롯의 병합이라 "겹치는 회의는"으로 회의 기준임을 밝힌다.
    expect(brief.avoidSentence).toContain("겹치는 회의는");
    expect(brief.avoidSentence).toContain("한예린님");
    expect(brief.avoidSentence).toContain("그 시간을 피해서");
  });

  it("5. 미응답이 있으면 잠정 결과 문구와 응답 기준 안내가 나온다 (시나리오 8)", () => {
    const brief = briefForCase(8, 3);

    // 도입부도 "모두의 응답"이 아니라 "지금까지의 응답"으로 바뀐다(의미 충돌 방지).
    expect(brief.introSentence).toBe("지금까지의 응답을 보니,");
    expect(brief.headline).toContain("잠정 결과");
    expect(brief.primarySentence).toContain("지금까지의 응답 기준");
    expect(brief.helperSentence).toContain("결과가 바뀔 수 있어요");
  });

  it("6. 전원 응답 상태의 도입부는 '모두의 응답을 보니,'다 (시나리오 1)", () => {
    const brief = briefForCase(1, 3);
    expect(brief.introSentence).toBe("모두의 응답을 보니,");
  });
});
