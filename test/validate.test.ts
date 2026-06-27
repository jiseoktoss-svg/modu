import { describe, expect, it } from "vitest";
import {
  isSlotConfirmable,
  MAX_BLOCKS_PER_PARTICIPANT,
  validateSubmittedBlocks,
  type SchedulerMeeting,
  type SchedulerParticipant,
} from "@/lib/scheduler";
import type { AttendanceType, AvailabilityStatus, ResponseStatus } from "@/lib/types";

const DATE = "2026-07-01"; // 수요일

function iso(hm: string, date = DATE): string {
  return `${date}T${hm}:00+09:00`;
}

const MEETING: SchedulerMeeting = {
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

function block(participantId: string, startHm: string, endHm: string, status: AvailabilityStatus) {
  return { participantId, startAt: iso(startHm), endAt: iso(endHm), status };
}

describe("isSlotConfirmable (#1)", () => {
  it("유효한 슬롯은 확정 가능하다", () => {
    const r = isSlotConfirmable(MEETING, [P("r", "required")], [], iso("10:00"), iso("11:00"));
    expect(r.ok).toBe(true);
  });

  it("회의 길이와 다른 슬롯은 거부한다", () => {
    const r = isSlotConfirmable(MEETING, [], [], iso("10:00"), iso("10:30"));
    expect(r.ok).toBe(false);
  });

  it("점심 시간과 겹치는 슬롯은 거부한다", () => {
    const r = isSlotConfirmable(MEETING, [], [], iso("12:00"), iso("13:00"));
    expect(r.ok).toBe(false);
  });

  it("근무 시간 밖 슬롯은 거부한다", () => {
    const r = isSlotConfirmable(MEETING, [], [], iso("18:00"), iso("19:00"));
    expect(r.ok).toBe(false);
  });

  it("30분 단위가 아닌 시작 시간은 거부한다", () => {
    const r = isSlotConfirmable(MEETING, [], [], iso("10:15"), iso("11:15"));
    expect(r.ok).toBe(false);
  });

  it("날짜 범위 밖 슬롯은 거부한다", () => {
    const r = isSlotConfirmable(
      MEETING,
      [],
      [],
      iso("10:00", "2026-07-09"),
      iso("11:00", "2026-07-09"),
    );
    expect(r.ok).toBe(false);
  });

  it("필수 참석자 busy 와 겹치는 슬롯은 거부한다", () => {
    const r = isSlotConfirmable(
      MEETING,
      [P("r", "required")],
      [block("r", "10:00", "11:00", "busy")],
      iso("10:00"),
      iso("11:00"),
    );
    expect(r.ok).toBe(false);
  });

  it("선택 참석자 busy 는 확정을 막지 않는다", () => {
    const r = isSlotConfirmable(
      MEETING,
      [P("o", "optional")],
      [block("o", "10:00", "11:00", "busy")],
      iso("10:00"),
      iso("11:00"),
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateSubmittedBlocks (#3)", () => {
  it("정상 블록은 통과한다", () => {
    const r = validateSubmittedBlocks(MEETING, [
      { startAt: iso("09:00"), endAt: iso("11:00"), status: "busy" },
      { startAt: iso("14:00"), endAt: iso("15:00"), status: "preferred" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("알 수 없는 status 는 거부한다", () => {
    const r = validateSubmittedBlocks(MEETING, [
      { startAt: iso("09:00"), endAt: iso("10:00"), status: "available" as AvailabilityStatus },
    ]);
    expect(r.ok).toBe(false);
  });

  it("시작이 종료보다 늦으면 거부한다", () => {
    const r = validateSubmittedBlocks(MEETING, [
      { startAt: iso("11:00"), endAt: iso("10:00"), status: "busy" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("날짜 범위 밖 블록은 거부한다", () => {
    const r = validateSubmittedBlocks(MEETING, [
      { startAt: iso("09:00", "2026-07-09"), endAt: iso("10:00", "2026-07-09"), status: "busy" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("근무 시간 밖 블록은 거부한다", () => {
    const r = validateSubmittedBlocks(MEETING, [
      { startAt: iso("08:00"), endAt: iso("09:00"), status: "busy" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("30분 단위가 아닌 블록은 거부한다", () => {
    const r = validateSubmittedBlocks(MEETING, [
      { startAt: iso("09:15"), endAt: iso("10:15"), status: "busy" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("개수 상한을 넘으면 거부한다", () => {
    const many = Array.from({ length: MAX_BLOCKS_PER_PARTICIPANT + 1 }, () => ({
      startAt: iso("09:00"),
      endAt: iso("09:30"),
      status: "busy" as AvailabilityStatus,
    }));
    const r = validateSubmittedBlocks(MEETING, many);
    expect(r.ok).toBe(false);
  });
});
