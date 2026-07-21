import { describe, expect, it } from "vitest";
import { summarizeDateAvailability } from "@/lib/scheduler/dateAvailabilitySummary";
import type { AvailabilityLookupParticipant } from "@/lib/scheduler/availabilityLookup";

// 캘린더 날짜 클릭 시 보여줄 '날짜 전체' 요약 — 대표 후보 시간 하나가 아니라
// 그 날짜의 모든 후보 시간(generateSlots 규칙)을 평가한다.

const PARTICIPANTS: AvailabilityLookupParticipant[] = [
  { id: "r1", name: "김지훈", role: "기획", attendanceType: "required", responseStatus: "submitted" },
  { id: "r2", name: "이서연", role: "디자인", attendanceType: "required", responseStatus: "submitted" },
  { id: "r3", name: "박민준", role: "개발", attendanceType: "required", responseStatus: "submitted" },
  { id: "r4", name: "최수아", role: "마케팅", attendanceType: "required", responseStatus: "submitted" },
  { id: "o1", name: "정우진", role: "개발", attendanceType: "optional", responseStatus: "submitted" },
  { id: "o2", name: "한예린", role: "디자인", attendanceType: "optional", responseStatus: "submitted" },
];

const BASE = {
  date: "2026-07-09",
  durationMinutes: 60,
  workdayStart: "09:00",
  workdayEnd: "18:00",
  // 점심 비활성 센티널(제품과 동일)
  lunchStart: "00:00",
  lunchEnd: "00:01",
  participants: PARTICIPANTS,
};

const at = (hm: string) => `2026-07-09T${hm}:00+09:00`;

describe("summarizeDateAvailability", () => {
  it("1. 모든 후보 시간에 전원이 가능하면 allSlotsAllAvailable = true, '회의 가능 시간대 전체' 문구가 나온다", () => {
    const summary = summarizeDateAvailability({ ...BASE, blocks: [] });

    expect(summary.totalSlots).toBeGreaterThan(0);
    expect(summary.allSlotsAllAvailable).toBe(true);
    expect(summary.headline).toContain("선택 가능한 모든 시간대");
    expect(summary.exceptionRanges).toHaveLength(0);
  });

  it("1-1. 같은 참가자의 겹친 busy 블록은 예외 구간 이름에 한 번만 들어간다", () => {
    const summary = summarizeDateAvailability({
      ...BASE,
      participants: [
        {
          id: "r1",
          name: "Alex",
          role: "PM",
          attendanceType: "required",
          responseStatus: "submitted",
        },
      ],
      blocks: [
        { participantId: "r1", startAt: at("09:00"), endAt: at("11:00"), status: "busy" },
        { participantId: "r1", startAt: at("10:00"), endAt: at("11:00"), status: "busy" },
      ],
    });

    expect(summary.exceptionRanges.length).toBeGreaterThan(0);
    expect(
      summary.exceptionRanges.every((range) => range.names.length === new Set(range.names).size),
    ).toBe(true);
    expect(summary.comment).not.toContain("Alex님과 Alex님");
  });

  it("1-2. 날짜 안의 가장 나은 시간은 필수 충돌이 적고 참석 가능 인원이 많은 가장 이른 슬롯이다", () => {
    const summary = summarizeDateAvailability({
      ...BASE,
      blocks: [
        { participantId: "r1", startAt: at("09:00"), endAt: at("11:00"), status: "busy" },
        { participantId: "o1", startAt: at("11:00"), endAt: at("18:00"), status: "busy" },
      ],
    });

    expect(summary.bestSlot?.startAt).toBe(at("11:00"));
    expect(summary.bestSlot?.requiredBusyNames).toEqual([]);
    expect(summary.bestSlot?.totalAvailable).toBe(5);
  });

  it("2. 일부 시간만 선택참석자가 불가능하면 optionalIssueSlots 에 잡히고 예외 구간으로 병합된다", () => {
    const summary = summarizeDateAvailability({
      ...BASE,
      blocks: [{ participantId: "o2", startAt: at("14:00"), endAt: at("15:00"), status: "busy" }],
    });

    expect(summary.allSlotsAllAvailable).toBe(false);
    expect(summary.requiredIssueSlots).toHaveLength(0);
    expect(summary.optionalIssueSlots.length).toBeGreaterThan(0);
    expect(summary.headline).toContain("대부분 시간에 모두가 참여할 수 있어요");
    expect(summary.comment).toContain("한예린님");

    // 예외는 후보 슬롯 병합이 아니라 '실제 busy 시각' 그대로 — 한예린 14:00~15:00 블록이
    // 그대로 한 구간이 된다(회의 길이만큼 넓어지지 않음 → 검색 결과와 일치).
    expect(summary.exceptionRanges).toHaveLength(1);
    expect(summary.exceptionRanges[0].reason).toBe("optionalBusy");
    expect(summary.exceptionRanges[0].startAt).toBe(at("14:00"));
    expect(summary.exceptionRanges[0].endAt).toBe(at("15:00"));
  });

  it("3. 일부 시간에 필수참석자가 불가능하면 requiredIssueSlots 에 잡히고 강하게 경고한다", () => {
    const summary = summarizeDateAvailability({
      ...BASE,
      blocks: [{ participantId: "r1", startAt: at("10:00"), endAt: at("11:00"), status: "busy" }],
    });

    expect(summary.requiredIssueSlots.length).toBeGreaterThan(0);
    expect(summary.headline).toContain("일부 시간에 꼭 함께할 사람이 참여하기 어려워요");
    expect(summary.comment).toContain("김지훈님");
    expect(summary.comment).toContain("피하는 게 좋아요");
    expect(summary.exceptionRanges[0].reason).toBe("requiredBusy");
  });

  it("4. 전원 가능한 시간이 하나도 없으면 allAvailableSlots 가 비고 안내 문구가 나온다", () => {
    const summary = summarizeDateAvailability({
      ...BASE,
      // 선택참석자 한 명이 근무시간 내내 불가 → 전원 가능 시간이 없다.
      blocks: [{ participantId: "o1", startAt: at("09:00"), endAt: at("18:00"), status: "busy" }],
    });

    expect(summary.allAvailableSlots).toHaveLength(0);
    expect(summary.headline).toContain("모든 인원이 맞는 시간이 없어요");
    // 필수참석자는 전 시간 가능하다는 점을 함께 알려준다.
    expect(summary.allSlotsRequiredAvailable).toBe(true);
    expect(summary.comment).toContain("꼭 함께할 사람은 모든 시간에 참여할 수 있어요");
  });

  it("5. 미응답자가 있으면 잠정 결과 수식어가 붙는다", () => {
    const summary = summarizeDateAvailability({
      ...BASE,
      participants: [
        ...PARTICIPANTS.slice(0, 5),
        { ...PARTICIPANTS[5], responseStatus: "pending" as const },
      ],
      blocks: [],
    });

    expect(summary.allSlotsAllAvailable).toBe(false);
    expect(summary.headline).toContain("잠정 결과");
    expect(summary.headline).toContain("응답한 사람 기준");
  });
});
