import { describe, expect, it } from "vitest";
import {
  buildCalendarMarks,
  buildContextualScheduleResult,
  evaluateAllSlots,
  pickAutoConfirmSlot,
  type EvaluatedSlot,
} from "@/lib/scheduler/contextualResult";
import { adaptDemoCaseToEvaluatedSlots } from "@/data/demoCaseAdapter";
import { DEMO_CASES } from "@/data/demoCases";
import { addDaysToDateStr, todayDateStrKst } from "@/lib/time";
import type { SchedulerInput } from "@/lib/scheduler";

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
    // 미응답자가 있으면 '필수참석자가 모두 가능'이라고 과장하지 않는다.
    expect(result.rankGroups[0].label).toBe("지금까지의 응답 기준 추천 후보");
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

// 자동 확정 — 투표 없이 modu 가 확정 조건(필수 전원 가능 + 미응답 없음)을 만족하는
// 최상위 후보를 일관된 규칙으로 고른다(서버 autoConfirmMeetingIfReady 의 판단부).
describe("pickAutoConfirmSlot", () => {
  it("13. 확정 조건을 만족하는 후보 중 정렬상 가장 앞(이른 시간)을 고른다", () => {
    const d = upcomingWeekdays(3);
    const slots = [
      makeSlot({ date: d[2], startHm: "10:00" }), // 전원 가능(늦은 날)
      makeSlot({ date: d[0], startHm: "14:00", optionalBusyNames: ["정우진"] }),
      makeSlot({ date: d[1], startHm: "10:00" }), // 전원 가능(빠른 날)
    ];
    const picked = pickAutoConfirmSlot(buildContextualScheduleResult(slots));
    // 같은 조건(전원 가능)이면 더 이른 날짜·시간이 우선 — 사람이 고르지 않는다.
    expect(picked?.date).toBe(d[1]);
  });

  it("14. 필수참석자가 모두 참석할 수 있는 후보가 없으면 확정하지 않는다", () => {
    const d = upcomingWeekdays(2);
    const slots = [
      makeSlot({ date: d[0], startHm: "10:00", requiredBusyNames: ["김지훈"] }),
      makeSlot({ date: d[1], startHm: "14:00", requiredBusyNames: ["이서연", "박민준"] }),
    ];
    expect(pickAutoConfirmSlot(buildContextualScheduleResult(slots))).toBeNull();
  });

  it("15. 미응답자가 있으면 확정하지 않는다", () => {
    const d = upcomingWeekdays(1)[0];
    const slots = [makeSlot({ date: d, startHm: "10:00", pendingNames: ["한예린"] })];
    expect(pickAutoConfirmSlot(buildContextualScheduleResult(slots))).toBeNull();
  });

  it("16. 필수가 빠지는 후보가 섞여 있어도 확정 조건을 만족하는 후보를 고른다", () => {
    const d = upcomingWeekdays(2);
    const slots = [
      makeSlot({ date: d[0], startHm: "10:00", requiredBusyNames: ["김지훈"] }),
      makeSlot({ date: d[1], startHm: "15:00", optionalBusyNames: ["정우진"] }),
    ];
    const picked = pickAutoConfirmSlot(buildContextualScheduleResult(slots));
    expect(picked?.date).toBe(d[1]);
    expect(picked?.requiredBusyCount).toBe(0);
  });
});

// 실제 회의 데이터(SchedulerInput) 경로 — 데모 어댑터 없이 evaluateAllSlots 를 직접 검증한다.
// 나중에 실데이터를 연결할 때 toSchedulerInput → evaluateAllSlots → buildContextualScheduleResult
// 로 이어지는 진입점을 잠가 둔다.
describe("evaluateAllSlots", () => {
  const REAL_INPUT: SchedulerInput = {
    meeting: {
      durationMinutes: 60,
      dateStart: "2026-07-01",
      dateEnd: "2026-07-01",
      workdayStart: "09:00",
      workdayEnd: "12:00",
      // 점심 비활성 센티널(제품과 동일)
      lunchStart: "00:00",
      lunchEnd: "00:01",
    },
    participants: [
      { id: "r1", name: "필수일", attendanceType: "required", responseStatus: "submitted" },
      { id: "r2", name: "필수이", attendanceType: "required", responseStatus: "submitted" },
      { id: "o1", name: "선택일", attendanceType: "optional", responseStatus: "submitted" },
    ],
    blocks: [
      {
        participantId: "r1",
        startAt: "2026-07-01T09:00:00+09:00",
        endAt: "2026-07-01T10:00:00+09:00",
        status: "busy",
      },
    ],
  };

  it("11. 필수참석자가 빠지는 슬롯도 버리지 않고 평가에 남긴다", () => {
    const slots = evaluateAllSlots(REAL_INPUT);

    // 09:00~12:00, 60분 회의, 30분 간격 → 09:00/09:30/10:00/10:30/11:00 시작 5개
    expect(slots).toHaveLength(5);

    const nine = slots.find((s) => s.startAt.includes("T09:00"));
    expect(nine).toBeDefined();
    expect(nine?.requiredBusyCount).toBe(1);
    expect(nine?.requiredBusyNames).toEqual(["필수일"]);
    expect(nine?.isSoftAvoid).toBe(true);
    expect(nine?.date).toBe("2026-07-01");

    // busy(09~10)와 겹치지 않는 슬롯은 전원 가능이다.
    const eleven = slots.find((s) => s.startAt.includes("T11:00"));
    expect(eleven?.isAllAvailable).toBe(true);
    expect(eleven?.totalAvailable).toBe(3);
  });

  it("12. 미응답자는 가능 인원에서 빼고 pendingNames 로 전달한다", () => {
    const slots = evaluateAllSlots({
      ...REAL_INPUT,
      blocks: [],
      participants: [
        ...REAL_INPUT.participants,
        { id: "o2", name: "미응답일", attendanceType: "optional", responseStatus: "pending" },
      ],
    });

    const first = slots[0];
    expect(first.pendingNames).toEqual(["미응답일"]);
    expect(first.totalParticipants).toBe(4);
    expect(first.totalAvailable).toBe(3); // 미응답자는 가능 인원으로 세지 않는다
    expect(first.isAllAvailable).toBe(false);

    const result = buildContextualScheduleResult(slots);
    expect(result.hasPending).toBe(true);
    expect(result.headline).toContain("잠정 결과");
  });
});
