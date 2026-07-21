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

function analysisForCase(id: number, days: number) {
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
  const brief = buildRecommendationBrief({ contextual, summaries });
  return { contextual, brief, summaries };
}

function briefForCase(id: number, days: number) {
  return analysisForCase(id, days).brief;
}

describe("buildRecommendationBrief", () => {
  it("0. 데모 케이스별 상황이 context와 headline에 다르게 드러난다", () => {
    const cases = new Map(
      [1, 2, 3, 5, 6, 7].map((id) => [id, analysisForCase(id, 8)]),
    );

    expect(cases.get(1)?.contextual.context).toBe("mostlyAvailable");
    expect(cases.get(2)?.contextual.context).toBe("busyPeriod");
    expect(cases.get(3)?.contextual.context).toBe("normal");
    expect(cases.get(5)?.contextual.context).toBe("mostlyAvailable");
    expect(cases.get(6)?.contextual.context).toBe("mostlyAvailable");

    // 미응답(시나리오 7)은 잠정 결과라 '대부분 가능'으로 과장하지 않는다.
    expect(cases.get(7)?.contextual.context).not.toBe("mostlyAvailable");

    cases.forEach(({ contextual, brief }) => {
      expect(brief.headline).toBe(contextual.headline);
      expect(brief.primarySentence).toBe(contextual.comment);
    });

    expect(cases.get(7)?.contextual.hasPending).toBe(true);
    expect(cases.get(7)?.brief.headline).toContain("아직 2명이 응답하지 않아 잠정 결과예요");
  });

  it("1. 추천 시간 화면 상단 문구는 캘린더 화면 문구와 같다 (시나리오 1, 짧은 기간)", () => {
    const { contextual, brief } = analysisForCase(1, 3);

    expect(brief.headline).toBe(contextual.headline);
    expect(brief.primarySentence).toBe(contextual.comment);
    expect(brief.primarySentence).not.toMatch(/\d{2}:\d{2}/);
    expect(brief.primaryItems[0].tone).toBe("good");
  });

  it("2. 전원 가능 날짜가 여러 개면 먼저 볼 날짜는 최대 3개까지만 나온다 (시나리오 1)", () => {
    const brief = briefForCase(1, 8);

    expect(brief.primaryItems.length).toBeGreaterThanOrEqual(1);
    expect(brief.primaryItems.length).toBeLessThanOrEqual(3);
  });

  it("2-1. 전원 가능 날짜가 많아도 상단 판단은 캘린더 화면과 맞춘다 (시나리오 1, 넓은 기간)", () => {
    const { contextual, brief } = analysisForCase(1, 8);

    expect(brief.headline).toBe(contextual.headline);
    expect(brief.primarySentence).toBe(contextual.comment);
    // 그 시간대는 avoid 문장에서 '시간에는'으로 짚는다.
    expect(brief.avoidSentence).toContain("시간에는");
  });

  it("2-1b. 문장에 등장하는 참석자 이름은 필수/선택 유형과 함께 nameBadges 로 수집된다 (시나리오 1)", () => {
    const brief = briefForCase(1, 8);

    // 점심 직후 예외 시간의 선택참석자 이름이 벳지 정보로 수집된다(화면에서 '선택 정우진' 형태).
    expect(brief.nameBadges.length).toBeGreaterThanOrEqual(1);
    const jungwoojin = brief.nameBadges.find((b) => b.name === "정우진");
    expect(jungwoojin?.attendanceType).toBe("optional");
    // 벳지로 나오는 이름은 문장에도 "{이름}님" 형태로 실제 등장한다.
    expect(brief.avoidSentence).toContain("정우진님");
  });

  it("3. 모두 바쁜 시나리오 2는 차선 날짜와 필수참석자 경고를 보여준다", () => {
    const { contextual, brief } = analysisForCase(2, 8);

    expect(contextual.context).toBe("busyPeriod");
    expect(brief.primarySentence).toContain("가장 나은 날짜");
    expect(brief.avoidItems.length).toBeGreaterThanOrEqual(1);
    expect(brief.avoidSentence).toBeDefined();
    expect(brief.avoidSentence).toContain("꼭 함께할 사람");
    expect(brief.avoidSentence).toContain("피하는 게 좋아요");
  });

  it("3-1. 모두 바쁜 시나리오 2의 날짜 상세 추천 시간이 한 시간으로 고정되지 않는다", () => {
    const { summaries } = analysisForCase(2, 8);
    const bestStartTimes = summaries
      .map((summary) => summary.bestSlot?.startAt.slice(11, 16))
      .filter((time): time is string => time !== undefined);

    expect(bestStartTimes.length).toBeGreaterThan(1);
    expect(new Set(bestStartTimes).size).toBeGreaterThan(1);
    expect(bestStartTimes.every((time) => time === "17:00")).toBe(false);
    expect(summaries.every((summary) => summary.allSlotsAllAvailable)).toBe(false);
  });

  it("4. 매일 필수참석자가 어려운 시간대가 있으면 브리프가 피하는 게 좋다고 안내한다 (시나리오 4)", () => {
    // 시나리오 4는 김지훈(필수)이 매일 13:00~14:00 불가. 캘린더는 '매일 그 시간만 피하면 됨'으로
    // 묶어 보여주지만, (현재 비활성인) 브리프는 아직 반복을 묶지 않고 날짜 기준으로 안내한다.
    const brief = briefForCase(4, 3);

    expect(brief.avoidSentence).toBeDefined();
    expect(brief.avoidSentence).toContain("꼭 함께할 사람");
    expect(brief.avoidSentence).toContain("피하는 게 좋아요");
  });

  it("5. 미응답이 있으면 캘린더 화면과 같은 잠정 결과 문구가 나온다 (시나리오 7)", () => {
    const { contextual, brief } = analysisForCase(7, 3);

    expect(brief.headline).toBe(contextual.headline);
    expect(brief.primarySentence).toBe(contextual.comment);
    expect(brief.headline).toContain("잠정 결과");
    expect(brief.helperSentence).toBeUndefined();
  });
});
