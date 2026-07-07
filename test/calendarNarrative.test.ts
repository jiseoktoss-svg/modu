import { describe, expect, it } from "vitest";
import { buildCalendarAlignedComment } from "@/lib/scheduler/calendarNarrative";
import type {
  CalendarDateQuality,
  CalendarDateQualityTier,
} from "@/lib/scheduler/calendarDateQuality";
import type { DateAvailabilitySummary } from "@/lib/scheduler/dateAvailabilitySummary";

const FILLED_DOTS_BY_TIER: Record<CalendarDateQualityTier, 1 | 2 | 3> = {
  high: 3,
  medium: 2,
  low: 1,
};

function quality(tier: CalendarDateQualityTier): CalendarDateQuality {
  return {
    score: FILLED_DOTS_BY_TIER[tier],
    tier,
    filledDots: FILLED_DOTS_BY_TIER[tier],
    label: tier,
  };
}

function summary(overrides: Partial<DateAvailabilitySummary> = {}): DateAvailabilitySummary {
  return {
    date: "2026-07-09",
    totalSlots: 1,
    allSlotsAllAvailable: false,
    allSlotsRequiredAvailable: true,
    allAvailableSlots: [],
    requiredIssueSlots: [],
    optionalIssueSlots: [],
    pendingSlots: [],
    bestSlot: null,
    headline: "",
    comment: "",
    exceptionRanges: [],
    ...overrides,
  };
}

function slot(
  date: string,
  startHm: string,
  endHm: string,
): NonNullable<DateAvailabilitySummary["bestSlot"]> {
  return {
    date,
    startAt: `${date}T${startHm}:00+09:00`,
    endAt: `${date}T${endHm}:00+09:00`,
    totalParticipants: 6,
    availableNames: [],
    busyNames: [],
    pendingNames: [],
    requiredAvailableNames: [],
    requiredBusyNames: [],
    requiredPendingNames: [],
    optionalAvailableNames: [],
    optionalBusyNames: [],
    optionalPendingNames: [],
    totalAvailable: 6,
    totalBusy: 0,
    totalPending: 0,
    requiredAllAvailable: true,
    hasPending: false,
  };
}

describe("buildCalendarAlignedComment", () => {
  it("uses a summary sentence instead of carrying over listed date text", () => {
    const comment = buildCalendarAlignedComment({
      contextual: {
        context: "normal",
        comment: "7/9, 7/21, 7/23 등 필수참석자가 어려운 시간이 있어요.",
        warnings: [],
      },
      dateQualityByDate: new Map([
        ["2026-07-09", quality("high")],
        ["2026-07-10", quality("low")],
      ]),
      summariesByDate: new Map([
        ["2026-07-09", summary({ allSlotsAllAvailable: true })],
        ["2026-07-10", summary({ date: "2026-07-10" })],
      ]),
    });

    expect(comment).toContain("추천도 원이 많은 날짜");
    expect(comment).not.toContain("2026");
    expect(comment).not.toContain("7/");
    expect(comment).not.toContain("등");
  });

  it("summarizes required participant issues without listing dates", () => {
    const requiredIssue =
      {} as DateAvailabilitySummary["requiredIssueSlots"][number];
    const comment = buildCalendarAlignedComment({
      contextual: {
        context: "normal",
        comment: "7/9, 7/21 등 필수참석자가 어려운 시간이 있어요.",
        warnings: [],
      },
      dateQualityByDate: new Map([
        ["2026-07-09", quality("medium")],
        ["2026-07-10", quality("high")],
      ]),
      summariesByDate: new Map([
        ["2026-07-09", summary({ requiredIssueSlots: [requiredIssue] })],
        ["2026-07-10", summary({ date: "2026-07-10", allSlotsAllAvailable: true })],
      ]),
    });

    expect(comment).toContain("필수참석자");
    expect(comment).toContain("추천도 원이 많은 날짜");
    expect(comment).not.toContain("2026");
    expect(comment).not.toContain("7/");
    expect(comment).not.toContain("등");
  });

  it("shows the earliest all-available day and time for a busy period", () => {
    const earlySlot = slot("2026-07-09", "10:00", "11:00");
    const laterSlot = slot("2026-07-10", "14:00", "15:00");
    const comment = buildCalendarAlignedComment({
      contextual: {
        context: "busyPeriod",
        comment: "그래도 7월 9일 10:00이 가장 나은 날짜예요.",
        warnings: [],
      },
      dateQualityByDate: new Map([
        ["2026-07-09", { ...quality("low"), score: 10 }],
        ["2026-07-10", { ...quality("high"), score: 50 }],
      ]),
      summariesByDate: new Map([
        [
          "2026-07-09",
          summary({
            date: "2026-07-09",
            bestSlot: earlySlot,
            allAvailableSlots: [earlySlot],
          }),
        ],
        [
          "2026-07-10",
          summary({
            date: "2026-07-10",
            bestSlot: laterSlot,
            allAvailableSlots: [laterSlot],
          }),
        ],
      ]),
    });

    expect(comment).toContain("전원이 참석 가능한 날짜 중 가장 빠른 날");
    expect(comment).toContain("7월 9일");
    expect(comment).toContain("그날 가장 빠른 시간");
    expect(comment).toContain("10:00~11:00");
  });
});
