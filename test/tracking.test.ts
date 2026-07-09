import { describe, expect, it } from "vitest";
import { clientIpHashFromHeaders } from "@/lib/trackingIp";
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
      event("1", "page_view", "회의 만들기", "/meetings/new", null, "visitor-1", "ip-a"),
      event("2", "page_view", "회의 만들기", "/meetings/new", null, "visitor-2", "ip-a"),
      event("3", "screen_view", "캘린더 화면", "/m/abc", "abc", "visitor-3", "ip-b"),
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

  it("uses visitor IDs only for legacy events without IP hashes", () => {
    const events: TrackingEvent[] = [
      event("1", "page_view", "랜딩", "/", null, "visitor-1", null),
      event("2", "page_view", "랜딩", "/", null, "visitor-1", null),
      event("3", "page_view", "랜딩", "/", null, "visitor-2", null),
    ];

    const summary = buildTrackingSummary(events, new Date("2026-07-08T10:00:00+09:00"));

    expect(summary.uniqueVisitorCount).toBe(2);
  });

  it("creates the same hash for the same forwarded IP without exposing the raw IP", () => {
    const forwardedHash = clientIpHashFromHeaders(
      new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.2" }),
    );
    const realIpHash = clientIpHashFromHeaders(new Headers({ "x-real-ip": "203.0.113.7" }));

    expect(forwardedHash).toBe(realIpHash);
    expect(forwardedHash).not.toContain("203.0.113.7");
  });
});

function event(
  id: string,
  eventName: TrackingEvent["eventName"],
  pageLabel: string,
  pagePath: string,
  meetingId: string | null,
  visitorId: string,
  ipHash: string | null,
): TrackingEvent {
  return {
    id,
    eventName,
    pagePath,
    pageLabel,
    meetingId,
    ipHash,
    visitorId,
    sessionId: `session-${visitorId}`,
    referrer: null,
    userAgent: null,
    deviceType: "desktop",
    viewportWidth: 1280,
    createdAt: "2026-07-08T01:00:00.000Z",
  };
}
