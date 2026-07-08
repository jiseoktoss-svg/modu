import { describe, expect, it } from "vitest";
import {
  buildTrackingSummary,
  getTrackingPageMeta,
  type TrackingEvent,
} from "@/lib/trackingModel";

describe("tracking model", () => {
  it("labels known page paths and screen views", () => {
    expect(getTrackingPageMeta("/meetings/new")).toMatchObject({
      pageLabel: "회의 만들기",
      meetingId: null,
    });
    expect(getTrackingPageMeta("/m/demo-1", "calendar")).toMatchObject({
      pageLabel: "캘린더 화면",
      meetingId: "demo-1",
    });
    expect(getTrackingPageMeta("/meetings/abc/share")).toMatchObject({
      pageLabel: "공유 화면",
      meetingId: "abc",
    });
  });

  it("builds dashboard counts from events", () => {
    const events: TrackingEvent[] = [
      event("1", "page_view", "회의 만들기", "/meetings/new", null, "visitor-1"),
      event("2", "page_view", "회의 만들기", "/meetings/new", null, "visitor-1"),
      event("3", "screen_view", "캘린더 화면", "/m/abc", "abc", "visitor-2"),
    ];

    const summary = buildTrackingSummary(events, new Date("2026-07-08T10:00:00+09:00"));

    expect(summary.totalCount).toBe(3);
    expect(summary.todayCount).toBe(3);
    expect(summary.uniqueVisitorCount).toBe(2);
    expect(summary.pageCounts[0]).toMatchObject({ label: "회의 만들기", count: 2 });
    expect(summary.eventCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "주소 방문", count: 2 }),
        expect.objectContaining({ label: "화면 진입", count: 1 }),
      ]),
    );
    expect(summary.meetingCounts[0]).toMatchObject({ label: "abc", count: 1 });
  });
});

function event(
  id: string,
  eventName: TrackingEvent["eventName"],
  pageLabel: string,
  pagePath: string,
  meetingId: string | null,
  visitorId: string,
): TrackingEvent {
  return {
    id,
    eventName,
    pagePath,
    pageLabel,
    meetingId,
    visitorId,
    sessionId: `session-${visitorId}`,
    referrer: null,
    userAgent: null,
    deviceType: "desktop",
    viewportWidth: 1280,
    createdAt: "2026-07-08T01:00:00.000Z",
  };
}
