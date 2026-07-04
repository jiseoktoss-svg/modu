import { describe, expect, it } from "vitest";
import {
  lookupAvailabilityAtTime,
  type AvailabilityLookupBlock,
  type AvailabilityLookupParticipant,
} from "@/lib/scheduler/availabilityLookup";

// 특정 시간 검색의 계산 코어 — 추천 후보 여부와 무관하게 시간 기준으로 직접 계산한다.

const PARTICIPANTS: AvailabilityLookupParticipant[] = [
  { id: "r1", name: "김필수", role: "기획", attendanceType: "required", responseStatus: "submitted" },
  { id: "r2", name: "이필수", role: "디자인", attendanceType: "required", responseStatus: "submitted" },
  { id: "o1", name: "박선택", role: "개발", attendanceType: "optional", responseStatus: "submitted" },
  { id: "o2", name: "최미응답", role: "마케팅", attendanceType: "optional", responseStatus: "pending" },
];

const at = (hm: string) => `2026-07-15T${hm}:00+09:00`;

describe("lookupAvailabilityAtTime", () => {
  it("1. busy 블록과 겹치는 참석자는 busy 로 분류된다", () => {
    const blocks: AvailabilityLookupBlock[] = [
      { participantId: "r1", startAt: at("14:00"), endAt: at("15:00"), status: "busy" },
    ];
    const result = lookupAvailabilityAtTime({
      participants: PARTICIPANTS,
      blocks,
      startAt: at("14:00"),
      endAt: at("15:00"),
    });

    expect(result.busyNames).toEqual(["김필수"]);
    expect(result.requiredBusyNames).toEqual(["김필수"]);
    expect(result.requiredAllAvailable).toBe(false);
    expect(result.date).toBe("2026-07-15");
  });

  it("2. busy 블록과 겹치지 않으면 available 로 분류된다", () => {
    const blocks: AvailabilityLookupBlock[] = [
      { participantId: "r1", startAt: at("10:00"), endAt: at("11:00"), status: "busy" },
    ];
    const result = lookupAvailabilityAtTime({
      participants: PARTICIPANTS,
      blocks,
      startAt: at("14:00"),
      endAt: at("15:00"),
    });

    expect(result.availableNames).toContain("김필수");
    expect(result.busyNames).toEqual([]);
  });

  it("3. pending 참석자는 pending 으로 분류되고 available 에 포함되지 않는다", () => {
    const result = lookupAvailabilityAtTime({
      participants: PARTICIPANTS,
      blocks: [],
      startAt: at("14:00"),
      endAt: at("15:00"),
    });

    expect(result.pendingNames).toEqual(["최미응답"]);
    expect(result.availableNames).not.toContain("최미응답");
    expect(result.totalAvailable).toBe(3);
    expect(result.hasPending).toBe(true);
    // 미응답이 남아 있으면 필수 전원 가능이라고 단정하지 않는다(선택 미응답이라 여기서는 true).
    expect(result.requiredAllAvailable).toBe(true);
  });

  it("4. required/optional 그룹이 정확히 나뉜다", () => {
    const blocks: AvailabilityLookupBlock[] = [
      { participantId: "o1", startAt: at("14:00"), endAt: at("15:00"), status: "busy" },
    ];
    const result = lookupAvailabilityAtTime({
      participants: PARTICIPANTS,
      blocks,
      startAt: at("14:00"),
      endAt: at("15:00"),
    });

    expect(result.requiredAvailableNames).toEqual(["김필수", "이필수"]);
    expect(result.optionalBusyNames).toEqual(["박선택"]);
    expect(result.optionalPendingNames).toEqual(["최미응답"]);
    expect(result.requiredAllAvailable).toBe(true);
    expect(result.totalBusy).toBe(1);
  });

  it("5. 검색 시간 범위가 블록과 부분적으로만 겹쳐도 busy 로 분류된다", () => {
    const blocks: AvailabilityLookupBlock[] = [
      { participantId: "r2", startAt: at("14:30"), endAt: at("15:30"), status: "busy" },
    ];
    const result = lookupAvailabilityAtTime({
      participants: PARTICIPANTS,
      blocks,
      startAt: at("14:00"),
      endAt: at("15:00"),
    });

    expect(result.busyNames).toEqual(["이필수"]);
  });

  it("6. avoid/preferred 블록은 busy 로 치지 않는다(추천 엔진과 동일)", () => {
    const blocks: AvailabilityLookupBlock[] = [
      { participantId: "r1", startAt: at("14:00"), endAt: at("15:00"), status: "avoid" },
      { participantId: "r2", startAt: at("14:00"), endAt: at("15:00"), status: "preferred" },
    ];
    const result = lookupAvailabilityAtTime({
      participants: PARTICIPANTS,
      blocks,
      startAt: at("14:00"),
      endAt: at("15:00"),
    });

    expect(result.busyNames).toEqual([]);
    expect(result.availableNames).toContain("김필수");
    expect(result.availableNames).toContain("이필수");
  });
});
