import { describe, expect, it } from "vitest";
import { buildCaseSnapshot, DEMO_CASES } from "@/data/demoCases";
import { summarizeDateAvailability } from "@/lib/scheduler/dateAvailabilitySummary";
import { addDaysToDateStr, todayDateStrKst } from "@/lib/time";

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

function caseById(id: number) {
  const found = DEMO_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`demo case ${id} not found`);
  return found;
}

function summariesForCase(id: number, days = 8) {
  const demoCase = caseById(id);
  const dates = upcomingWeekdays(days);
  const snapshot = buildCaseSnapshot(demoCase, dates);
  return dates.map((date) =>
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
}

function summarySignature(summary: ReturnType<typeof summarizeDateAvailability>) {
  if (summary.allSlotsAllAvailable) return "all-ok";
  const best = summary.bestSlot
    ? `${summary.bestSlot.startAt.slice(11, 16)}-${summary.bestSlot.endAt.slice(11, 16)}`
    : "none";
  const exceptions = summary.exceptionRanges
    .map((range) => `${range.startAt.slice(11, 16)}-${range.endAt.slice(11, 16)}:${range.names.join("/")}`)
    .join("|");
  return `${best}|${exceptions}`;
}

describe("demo case date detail diversity", () => {
  it("상황 2는 날짜를 바꿔도 같은 추천 시간만 반복하지 않는다", () => {
    const summaries = summariesForCase(2, 8);
    const bestRanges = summaries
      .map((summary) =>
        summary.bestSlot
          ? `${summary.bestSlot.startAt.slice(11, 16)}-${summary.bestSlot.endAt.slice(11, 16)}`
          : "none",
      )
      .filter((range) => range !== "none");

    expect(new Set(bestRanges).size).toBeGreaterThanOrEqual(3);
    expect(bestRanges.filter((range) => range === "17:00-18:00").length).toBeLessThan(
      bestRanges.length,
    );
  });

  it("반복 시간대가 핵심인 상황 4를 제외한 케이스들은 날짜별 상세 신호가 섞여 있다", () => {
    for (const id of [1, 3, 5, 6, 7]) {
      const signatures = new Set(summariesForCase(id, 8).map(summarySignature));
      expect(signatures.size, `case ${id}`).toBeGreaterThan(1);
    }
  });
});
