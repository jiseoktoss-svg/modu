import { describe, expect, it } from "vitest";
import { generateSlots } from "@/lib/scheduler/generateSlots";
import { recommendSlots } from "@/lib/scheduler";
import type {
  SchedulerBlock,
  SchedulerInput,
  SchedulerMeeting,
  SchedulerParticipant,
} from "@/lib/scheduler";
import type { AttendanceType, AvailabilityStatus, ResponseStatus } from "@/lib/types";

const DATE = "2026-07-01"; // 수요일

function iso(hm: string): string {
  return `${DATE}T${hm}:00+09:00`;
}

const BASE_MEETING: SchedulerMeeting = {
  durationMinutes: 60,
  dateStart: DATE,
  dateEnd: DATE,
  workdayStart: "09:00",
  workdayEnd: "18:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
};

function P(
  id: string,
  attendanceType: AttendanceType,
  responseStatus: ResponseStatus = "submitted",
): SchedulerParticipant {
  return { id, name: id, attendanceType, responseStatus };
}

function B(
  participantId: string,
  startHm: string,
  endHm: string,
  status: AvailabilityStatus,
): SchedulerBlock {
  return { participantId, startAt: iso(startHm), endAt: iso(endHm), status };
}

function input(
  participants: SchedulerParticipant[],
  blocks: SchedulerBlock[],
): SchedulerInput {
  return { meeting: BASE_MEETING, participants, blocks, maxCandidates: 50 };
}

describe("generateSlots", () => {
  it("점심 시간과 겹치는 후보는 제외한다", () => {
    const slots = generateSlots(BASE_MEETING);
    expect(slots.some((s) => s.startAt === iso("11:30"))).toBe(false); // 11:30~12:30
    expect(slots.some((s) => s.startAt === iso("12:00"))).toBe(false);
    expect(slots.some((s) => s.startAt === iso("12:30"))).toBe(false);
    expect(slots.some((s) => s.startAt === iso("13:00"))).toBe(true); // 13:00~14:00
  });

  it("근무 시간을 벗어나는 후보는 만들지 않는다", () => {
    const slots = generateSlots(BASE_MEETING);
    expect(slots.some((s) => s.startAt === iso("17:00"))).toBe(true); // 17:00~18:00
    expect(slots.some((s) => s.startAt === iso("17:30"))).toBe(false); // 17:30~18:30 (초과)
  });
});

describe("recommendSlots — 제외 규칙", () => {
  it("필수 참석자의 busy 와 겹치는 후보는 제외한다", () => {
    const recs = recommendSlots(input([P("r", "required")], [B("r", "14:00", "15:00", "busy")]));
    expect(recs.find((c) => c.startAt === iso("14:00"))).toBeUndefined();
    expect(recs.find((c) => c.startAt === iso("10:00"))).toBeDefined();
  });

  it("선택 참석자의 busy 와 겹치는 후보는 제외하지 않고 감점한다", () => {
    const recs = recommendSlots(input([P("o", "optional")], [B("o", "15:00", "16:00", "busy")]));
    const slot = recs.find((c) => c.startAt === iso("15:00"));
    expect(slot).toBeDefined();
    expect(slot!.busyOptionalCount).toBe(1);
    const free = recs.find((c) => c.startAt === iso("10:00"))!;
    expect(slot!.score).toBeLessThan(free.score);
  });
});

describe("recommendSlots — 감점/가점 규칙", () => {
  it("avoid 는 감점한다", () => {
    const recs = recommendSlots(input([P("a", "required")], [B("a", "16:00", "17:00", "avoid")]));
    const slot = recs.find((c) => c.startAt === iso("16:00"))!;
    expect(slot.avoidConflictCount).toBe(1);
    const free = recs.find((c) => c.startAt === iso("10:00"))!;
    expect(slot.score).toBeLessThan(free.score);
  });

  it("preferred 는 가점한다", () => {
    const recs = recommendSlots(
      input([P("a", "required")], [B("a", "10:00", "11:00", "preferred")]),
    );
    const slot = recs.find((c) => c.startAt === iso("10:00"))!;
    expect(slot.preferredCount).toBe(1);
    const free = recs.find((c) => c.startAt === iso("09:00"))!;
    expect(slot.score).toBeGreaterThan(free.score);
  });
});

describe("recommendSlots — 미응답 / 등급 / 설명", () => {
  it("미응답자가 있으면 후보에 상태가 표시된다", () => {
    const recs = recommendSlots(
      input([P("r", "required"), P("x", "optional", "pending")], []),
    );
    const slot = recs[0];
    expect(slot.hasPendingParticipants).toBe(true);
    expect(slot.pendingCount).toBe(1);
    expect(slot.impacts.some((im) => im.status === "pending")).toBe(true);
  });

  it("'가장 추천'(best) 등급은 최대 1개만 부여한다", () => {
    const recs = recommendSlots(input([P("r", "required")], []));
    expect(recs.filter((c) => c.grade === "best").length).toBe(1);
  });

  it("모든 후보는 한국어 추천 이유를 가진다", () => {
    const recs = recommendSlots(input([P("r", "required")], []));
    expect(recs.length).toBeGreaterThan(0);
    for (const c of recs) {
      expect(c.reason.length).toBeGreaterThan(0);
      expect(c.reason.endsWith(".")).toBe(true);
    }
  });

  it("필수 미응답자는 추천 이유에서 한 번만 언급된다", () => {
    const recs = recommendSlots(
      input([P("r", "required", "pending"), P("s", "required")], []),
    );
    const occurrences = (recs[0].reason.match(/응답하지 않/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("선택 미응답자는 순위가 바뀔 수 있다고 별도 언급된다", () => {
    const recs = recommendSlots(
      input([P("r", "required"), P("o", "optional", "pending")], []),
    );
    expect(recs[0].reason).toContain("순위가 바뀔 수 있어요");
  });
});
