import { describe, expect, it } from "vitest";
import { trackingGeoFromHeaders } from "@/lib/trackingGeo";
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
      event("1", "page_view", "랜딩", "/", null, "visitor-1", "ip-a"),
      event("2", "page_view", "회의 만들기", "/meetings/new", null, "visitor-1", "ip-a"),
      event("3", "page_view", "랜딩", "/", null, "visitor-2", "ip-b", undefined, "mobile"),
      event("4", "page_view", "공유 화면", "/meetings/abc/share", "abc", "visitor-1", "ip-a"),
      event("5", "screen_view", "캘린더 화면", "/m/abc", "abc", "visitor-3", "ip-c"),
      event(
        "6",
        "page_view",
        "랜딩",
        "/",
        null,
        "visitor-4",
        "ip-d",
        "2026-07-07T01:00:00.000Z",
      ),
    ];

    const summary = buildTrackingSummary(events, new Date("2026-07-08T10:00:00+09:00"));

    expect(summary.totalCount).toBe(6);
    expect(summary.todayUniqueVisitorCount).toBe(3);
    expect(summary.uniqueVisitorCount).toBe(4);
    expect(summary.meetingCreationRate).toBe(33.3);
    expect(summary.meetingCreationFunnel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "landing", count: 3, conversionRate: 100 }),
        expect.objectContaining({ key: "new_meeting", count: 1, dropOffCount: 2 }),
        expect.objectContaining({ key: "share", count: 1, conversionRate: 33.3 }),
      ]),
    );
    expect(summary.dropOffRows[0]).toMatchObject({
      label: "회의 생성 · 랜딩 방문 → 회의 만들기 진입",
      dropOffCount: 2,
      dropOffRate: 66.7,
    });
    expect(summary.deviceVisitorCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "PC", count: 3 }),
        expect.objectContaining({ label: "모바일", count: 1 }),
      ]),
    );
    expect(summary.trafficSourceCounts[0]).toMatchObject({
      label: "직접/알 수 없음",
      count: 4,
    });
    expect(summary.countryVisitorCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "KR", count: 3 }),
        expect.objectContaining({ label: "US", count: 1 }),
      ]),
    );
    expect(summary.cityVisitorCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Seoul, 11, KR", count: 3 }),
        expect.objectContaining({ label: "New York, NY, US", count: 1 }),
      ]),
    );
    expect(summary.pageCounts[0]).toMatchObject({ label: "랜딩", count: 3 });
    expect(summary.eventCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "주소 방문", count: 5 }),
        expect.objectContaining({ label: "화면 진입", count: 1 }),
      ]),
    );
    expect(summary.meetingCounts[0]).toMatchObject({ label: "abc", count: 2 });
    expect(summary.hourlyCounts).toEqual([{ hour: "10:00", count: 5 }]);
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

  it("reads Vercel geo headers without exposing the raw IP", () => {
    const geo = trackingGeoFromHeaders(
      new Headers({
        "x-vercel-ip-country": "kr",
        "x-vercel-ip-country-region": "11",
        "x-vercel-ip-city": "Seoul%20Gangnam",
        "x-vercel-ip-timezone": "Asia%2FSeoul",
      }),
    );

    expect(geo).toEqual({
      geoCountry: "KR",
      geoRegion: "11",
      geoCity: "Seoul Gangnam",
      geoTimezone: "Asia/Seoul",
    });
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
  createdAt = "2026-07-08T01:00:00.000Z",
  deviceType = "desktop",
  referrer: string | null = null,
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
    referrer,
    userAgent: null,
    deviceType,
    viewportWidth: 1280,
    geoCountry: ipHash === "ip-c" ? "US" : ipHash ? "KR" : null,
    geoRegion: ipHash === "ip-c" ? "NY" : ipHash ? "11" : null,
    geoCity: ipHash === "ip-c" ? "New York" : ipHash ? "Seoul" : null,
    geoTimezone: ipHash ? "Asia/Seoul" : null,
    createdAt,
  };
}
