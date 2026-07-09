import type { TrackingEventRow } from "@/lib/types";

export type TrackingEventName = "page_view" | "screen_view";

export interface TrackingEvent {
  id: string;
  eventName: TrackingEventName;
  pagePath: string;
  pageLabel: string;
  meetingId: string | null;
  ipHash: string | null;
  visitorId: string | null;
  sessionId: string | null;
  referrer: string | null;
  userAgent: string | null;
  deviceType: string;
  viewportWidth: number | null;
  createdAt: string;
}

export interface TrackingPageMeta {
  pagePath: string;
  pageLabel: string;
  meetingId: string | null;
}

export interface TrackingCountRow {
  key: string;
  label: string;
  count: number;
}

export interface TrackingSummary {
  totalCount: number;
  todayCount: number;
  uniqueVisitorCount: number;
  pageCounts: TrackingCountRow[];
  eventCounts: TrackingCountRow[];
  meetingCounts: TrackingCountRow[];
  hourlyCounts: { hour: string; count: number }[];
  recentEvents: TrackingEvent[];
}

const TRACKING_EVENT_NAMES = new Set<string>(["page_view", "screen_view"]);

export function isTrackingEventName(value: unknown): value is TrackingEventName {
  return typeof value === "string" && TRACKING_EVENT_NAMES.has(value);
}

export function getTrackingPageMeta(pathname: string, screenName?: string | null): TrackingPageMeta {
  const pagePath = normalizePagePath(pathname);
  const segments = pagePath.split("/").filter(Boolean);

  if (screenName === "calendar") {
    return {
      pagePath,
      pageLabel: "캘린더 화면",
      meetingId: segments[0] === "m" ? segments[1] ?? null : null,
    };
  }

  if (screenName === "response_intro") {
    return {
      pagePath,
      pageLabel: "참석자 안내 화면",
      meetingId: segments[0] === "m" ? segments[1] ?? null : null,
    };
  }

  if (screenName === "response_identity") {
    return {
      pagePath,
      pageLabel: "본인 확인 화면",
      meetingId: segments[0] === "m" ? segments[1] ?? null : null,
    };
  }

  if (screenName === "availability_input") {
    return {
      pagePath,
      pageLabel: "가능 시간 입력 화면",
      meetingId: segments[0] === "m" ? segments[1] ?? null : null,
    };
  }

  if (screenName === "response_review") {
    return {
      pagePath,
      pageLabel: "응답 확인 화면",
      meetingId: segments[0] === "m" ? segments[1] ?? null : null,
    };
  }

  if (screenName === "response_waiting") {
    return {
      pagePath,
      pageLabel: "응답 대기 화면",
      meetingId: segments[0] === "m" ? segments[1] ?? null : null,
    };
  }

  if (pagePath === "/") {
    return { pagePath, pageLabel: "랜딩", meetingId: null };
  }

  if (pagePath === "/meetings/new") {
    return { pagePath, pageLabel: "회의 만들기", meetingId: null };
  }

  if (segments[0] === "m" && segments[1]) {
    return { pagePath, pageLabel: "참석자 응답", meetingId: segments[1] };
  }

  if (segments[0] === "meetings" && segments[1] && segments[2] === "share") {
    return { pagePath, pageLabel: "공유 화면", meetingId: segments[1] };
  }

  if (segments[0] === "meetings" && segments[1] && segments[2] === "confirmed") {
    return { pagePath, pageLabel: "확정 회의 화면", meetingId: segments[1] };
  }

  return { pagePath, pageLabel: pagePath, meetingId: null };
}

export function detectDeviceType(userAgent: string | null): string {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("ipad") || ua.includes("tablet")) return "tablet";
  if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) {
    return "mobile";
  }
  return "desktop";
}

export function mapTrackingEvent(row: TrackingEventRow): TrackingEvent {
  return {
    id: row.id,
    eventName: isTrackingEventName(row.event_name) ? row.event_name : "page_view",
    pagePath: row.page_path,
    pageLabel: row.page_label,
    meetingId: row.meeting_id,
    ipHash: row.ip_hash ?? null,
    visitorId: row.visitor_id,
    sessionId: row.session_id,
    referrer: row.referrer,
    userAgent: row.user_agent,
    deviceType: row.device_type,
    viewportWidth: row.viewport_width,
    createdAt: row.created_at,
  };
}

export function buildTrackingSummary(events: TrackingEvent[], now = new Date()): TrackingSummary {
  const todayKey = formatKstDateKey(now);
  const uniqueVisitors = new Set(events.map(uniqueVisitorKey).filter(Boolean));

  return {
    totalCount: events.length,
    todayCount: events.filter((event) => formatKstDateKey(new Date(event.createdAt)) === todayKey)
      .length,
    uniqueVisitorCount: uniqueVisitors.size,
    pageCounts: countBy(events, (event) => `${event.pageLabel}|${event.pagePath}`).map(
      splitCountLabel,
    ),
    eventCounts: countBy(events, (event) =>
      event.eventName === "screen_view" ? "화면 진입|screen_view" : "주소 방문|page_view",
    ).map(splitCountLabel),
    meetingCounts: countBy(
      events.filter((event) => event.meetingId),
      (event) => `${event.meetingId}|${event.meetingId}`,
    ).map(splitCountLabel),
    hourlyCounts: buildTodayHourlyCounts(events, todayKey),
    recentEvents: events.slice(0, 50),
  };
}

function uniqueVisitorKey(event: TrackingEvent) {
  // 새 기록은 IP 해시 기준으로 중복 제거한다.
  // 기존 기록에는 IP 해시가 없어서, 그 기록만 기존 브라우저 방문자 ID로 계산한다.
  if (event.ipHash) return `ip:${event.ipHash}`;
  if (event.visitorId) return `visitor:${event.visitorId}`;
  return null;
}

function normalizePagePath(pathname: string) {
  const trimmed = pathname.trim();
  const pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? "/";
  if (!pathOnly.startsWith("/")) return `/${pathOnly}`;
  return pathOnly || "/";
}

function formatKstDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatKstHour(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  }).format(date);
}

function countBy<T>(items: T[], keyOf: (item: T) => string): TrackingCountRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 20);
}

function splitCountLabel(row: TrackingCountRow): TrackingCountRow {
  const [label, key] = row.key.split("|");
  return {
    key: key ?? row.key,
    label: label ?? row.key,
    count: row.count,
  };
}

function buildTodayHourlyCounts(events: TrackingEvent[], todayKey: string) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const createdAt = new Date(event.createdAt);
    if (formatKstDateKey(createdAt) !== todayKey) continue;
    const hour = `${formatKstHour(createdAt)}시`;
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}
