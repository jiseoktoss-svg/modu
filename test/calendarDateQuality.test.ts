import { describe, expect, it } from "vitest";
import { rankDateAvailabilitySummaries } from "@/lib/scheduler/calendarDateQuality";
import { summarizeDateAvailability } from "@/lib/scheduler/dateAvailabilitySummary";
import type { AvailabilityLookupParticipant } from "@/lib/scheduler/availabilityLookup";

const PARTICIPANTS: AvailabilityLookupParticipant[] = [
  { id: "r1", name: "김지훈", role: "기획", attendanceType: "required", responseStatus: "submitted" },
  { id: "r2", name: "이서연", role: "디자인", attendanceType: "required", responseStatus: "submitted" },
  { id: "r3", name: "박민준", role: "개발", attendanceType: "required", responseStatus: "submitted" },
  { id: "r4", name: "최수아", role: "마케팅", attendanceType: "required", responseStatus: "submitted" },
  { id: "o1", name: "정우진", role: "개발", attendanceType: "optional", responseStatus: "submitted" },
  { id: "o2", name: "한예린", role: "디자인", attendanceType: "optional", responseStatus: "submitted" },
];

const base = (date: string) => ({
  date,
  durationMinutes: 60,
  workdayStart: "09:00",
  workdayEnd: "18:00",
  lunchStart: "00:00",
  lunchEnd: "00:01",
  participants: PARTICIPANTS,
});

const at = (date: string, hm: string) => `${date}T${hm}:00+09:00`;

describe("rankDateAvailabilitySummaries", () => {
  it("날짜 점수를 전체 기간 안에서 상·중·하 추천도로 나눈다", () => {
    const highDate = "2026-07-09";
    const mediumDate = "2026-07-10";
    const lowDate = "2026-07-13";
    const ranked = rankDateAvailabilitySummaries([
      [highDate, summarizeDateAvailability({ ...base(highDate), blocks: [] })],
      [
        mediumDate,
        summarizeDateAvailability({
          ...base(mediumDate),
          blocks: [
            {
              participantId: "o1",
              startAt: at(mediumDate, "09:00"),
              endAt: at(mediumDate, "18:00"),
              status: "busy",
            },
          ],
        }),
      ],
      [
        lowDate,
        summarizeDateAvailability({
          ...base(lowDate),
          blocks: [
            {
              participantId: "r1",
              startAt: at(lowDate, "09:00"),
              endAt: at(lowDate, "18:00"),
              status: "busy",
            },
          ],
        }),
      ],
    ]);

    expect(ranked.get(highDate)?.tier).toBe("high");
    expect(ranked.get(highDate)?.filledDots).toBe(3);
    expect(ranked.get(mediumDate)?.tier).toBe("medium");
    expect(ranked.get(mediumDate)?.filledDots).toBe(2);
    expect(ranked.get(lowDate)?.tier).toBe("low");
    expect(ranked.get(lowDate)?.filledDots).toBe(1);
  });

  it("모든 날짜가 같은 점수면 같은 상위 추천도로 보여준다", () => {
    const firstDate = "2026-07-09";
    const secondDate = "2026-07-10";
    const ranked = rankDateAvailabilitySummaries([
      [firstDate, summarizeDateAvailability({ ...base(firstDate), blocks: [] })],
      [secondDate, summarizeDateAvailability({ ...base(secondDate), blocks: [] })],
    ]);

    expect(ranked.get(firstDate)?.tier).toBe("high");
    expect(ranked.get(secondDate)?.tier).toBe("high");
    expect(ranked.get(firstDate)?.filledDots).toBe(3);
    expect(ranked.get(secondDate)?.filledDots).toBe(3);
  });
});
