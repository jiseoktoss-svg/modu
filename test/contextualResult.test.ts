import { describe, expect, it } from "vitest";
import {
  buildCalendarMarks,
  buildContextualScheduleResult,
  type EvaluatedSlot,
} from "@/lib/scheduler/contextualResult";
import { adaptDemoCaseToEvaluatedSlots } from "@/data/demoCaseAdapter";
import { DEMO_CASES } from "@/data/demoCases";
import { addDaysToDateStr, todayDateStrKst } from "@/lib/time";

// ---- fixture 도우미 ----

// 데모 어댑터는 '오늘 이후 평일'만 쓰므로(resolveDemoDates) 내일부터의 평일 n개를 만든다.
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

// 수제 슬롯(전체 6명 = 필수 4 + 선택 2, 데모와 동일 전제).
function makeSlot(over: {
  date: string;
  startHm: string; // "10:00"
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
  const [h, m] = over.startHm.split(":").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startAt: `${over.date}T${pad(h)}:${pad(m)}:00+09:00`,
    endAt: `${over.date}T${pad(h + 1)}:${pad(m)}:00+09:00`,
    date: over.date,
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

// ---- 테스트 ----

describe("contextualResult", () => {
  it("1. pending 은 context 가 아니라 잠정 결과 수식어로 처리된다 (케이스 7)", () => {
    const slots = adaptDemoCaseToEvaluatedSlots(caseById(7), upcomingWeekdays(3));
    const result = buildContextualScheduleResult(slots);

    expect(result.hasPending).toBe(true);
    expect(result.pendingNames).toContain("최수아");
    expect(result.pendingNames).toContain("한예린");
    // context 는 4가지 상태 중 하나여야 하고 pending 이라는 별도 상태는 없다.
    expect(["mostlyAvailable", "normal", "busyPeriod", "noGoodOption"]).toContain(result.context);
    expect(result.headline).toContain("잠정 결과");
  });

  it("2. 같은 조건의 후보는 같은 rankGroup 으로 묶인다", () => {
    const d = upcomingWeekdays(3);
    const slots = [
      makeSlot({ date: d[0], startHm: "10:00" }),
      makeSlot({ date: d[1], startHm: "14:00" }),
      makeSlot({ date: d[2], startHm: "10:00", optionalBusyNames: ["정우진"] }),
    ];
    const result = buildContextualScheduleResult(slots);

    expect(result.rankGroups[0].slots).toHaveLength(2);
    expect(result.rankGroups[0].label).toBe("모두 참석할 수 있는 후보");
    expect(result.rankGroups[1].slots).toHaveLength(1);
  });

  it("3. mostlyAvailable 에서는 파란색이 남발되지 않는다 (케이스 1)", () => {
    const slots = adaptDemoCaseToEvaluatedSlots(caseById(1), upcomingWeekdays(8));
    const result = buildContextualScheduleResult(slots);

    expect(result.context).toBe("mostlyAvailable");
    expect(result.calendarMarks.filter((m) => m.tone === "recommended")).toHaveLength(0);
  });

  it("4. mostlyAvailable 에서 필수참석자 불가 예외는 코멘트로 노출된다 (케이스 4 + 넓은 기간)", () => {
    const slots = adaptDemoCaseToEvaluatedSlots(caseById(4), upcomingWeekdays(8));
    const result = buildContextualScheduleResult(slots);

    expect(result.context).toBe("mostlyAvailable");
    expect(result.comment).toContain("피해주세요");
    // 케이스 4의 필수 불가 인원 중 한 명이 문구에 나와야 한다.
    expect(
      ["최수아", "이서연", "박민준"].some((name) => result.comment.includes(`${name}님`)),
    ).toBe(true);
  });

  it("5. busyPeriod 에서는 최선 후보 1~2개만 recommended 로 표시된다 (케이스 5)", () => {
    const slots = adaptDemoCaseToEvaluatedSlots(caseById(5), upcomingWeekdays(3));
    const result = buildContextualScheduleResult(slots);

    expect(result.context).toBe("busyPeriod");
    const recommended = result.calendarMarks.filter((m) => m.tone === "recommended");
    expect(recommended.length).toBeGreaterThanOrEqual(1);
    expect(recommended.length).toBeLessThanOrEqual(2);
  });

  it("6. noGoodOption 에서는 파란색 없이 기간을 넓히는 문구가 나온다 (케이스 6)", () => {
    const slots = adaptDemoCaseToEvaluatedSlots(caseById(6), upcomingWeekdays(3));
    const result = buildContextualScheduleResult(slots);

    expect(result.context).toBe("noGoodOption");
    expect(result.calendarMarks.filter((m) => m.tone === "recommended")).toHaveLength(0);
    expect(result.headline).toContain("없어요");
    expect(result.comment).toContain("기간을 조금 넓히는");
  });

  it("7. 날짜 톤은 그날의 최선 슬롯 기준으로 정해진다", () => {
    const d = upcomingWeekdays(1)[0];
    const good = makeSlot({ date: d, startHm: "14:00" });
    const bad = makeSlot({ date: d, startHm: "10:00", requiredBusyNames: ["김지훈", "이서연"] });
    const marks = buildCalendarMarks([bad, good], [good]);

    expect(marks).toHaveLength(1);
    expect(marks[0].tone).toBe("recommended");
    expect(marks[0].representativeSlot?.startAt).toBe(good.startAt);
  });

  it("8. 특정 시간만 위험한 날짜는 날짜 전체가 빨강이 되지 않는다", () => {
    const d = upcomingWeekdays(1)[0];
    const good = makeSlot({ date: d, startHm: "14:00" });
    const bad = makeSlot({ date: d, startHm: "10:00", requiredBusyNames: ["김지훈", "이서연"] });
    const marks = buildCalendarMarks([bad, good], []);

    expect(marks[0].tone).toBe("none");
  });

  it("9. 그날 모든 슬롯이 hardAvoid 일 때만 날짜가 avoid 가 된다", () => {
    const d = upcomingWeekdays(1)[0];
    const bad1 = makeSlot({ date: d, startHm: "10:00", requiredBusyNames: ["김지훈", "이서연"] });
    const bad2 = makeSlot({ date: d, startHm: "14:00", requiredBusyNames: ["박민준", "최수아"] });
    const marks = buildCalendarMarks([bad1, bad2], []);

    expect(marks[0].tone).toBe("avoid");
  });

  it("10. 케이스 8의 동점/유사 후보는 과도하게 순위가 갈리지 않고 그룹화된다", () => {
    const slots = adaptDemoCaseToEvaluatedSlots(caseById(8), upcomingWeekdays(5));
    const result = buildContextualScheduleResult(slots);

    // 전원 참석 가능한 후보들(케이스 슬롯 1개 + 빈 평일 채움 2개)이 한 그룹으로 묶인다.
    expect(result.rankGroups[0].slots.length).toBeGreaterThanOrEqual(2);
    expect(result.rankGroups[0].label).toBe("모두 참석할 수 있는 후보");
    const signatures = new Set(
      result.rankGroups[0].slots.map((s) => `${s.requiredBusyCount}|${s.totalAvailable}`),
    );
    expect(signatures.size).toBe(1);
  });
});
