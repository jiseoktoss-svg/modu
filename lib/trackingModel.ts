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
  geoCountry: string | null;
  geoRegion: string | null;
  geoCity: string | null;
  geoTimezone: string | null;
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

export interface TrackingFunnelStep {
  key: string;
  label: string;
  count: number;
  conversionRate: number | null;
  dropOffCount: number | null;
  dropOffRate: number | null;
}

export interface TrackingDropOffRow {
  key: string;
  label: string;
  dropOffCount: number;
  dropOffRate: number;
}

export interface TrackingSummary {
  totalCount: number;
  todayUniqueVisitorCount: number;
  uniqueVisitorCount: number;
  meetingCreationRate: number | null;
  meetingCreationFunnel: TrackingFunnelStep[];
  responseFunnel: TrackingFunnelStep[];
  dropOffRows: TrackingDropOffRow[];
  deviceVisitorCounts: TrackingCountRow[];
  trafficSourceCounts: TrackingCountRow[];
  countryVisitorCounts: TrackingCountRow[];
  cityVisitorCounts: TrackingCountRow[];
  pageCounts: TrackingCountRow[];
  eventCounts: TrackingCountRow[];
  meetingCounts: TrackingCountRow[];
  hourlyCounts: { hour: string; count: number }[];
  recentEvents: TrackingEvent[];
}

const TRACKING_EVENT_NAMES = new Set<string>(["page_view", "screen_view"]);

const MEETING_CREATION_FUNNEL = [
  { key: "landing", label: "랜딩 방문", pageLabel: "랜딩" },
  { key: "new_meeting", label: "일정 만들기 진입", pageLabel: "일정 만들기" },
  { key: "share", label: "공유 화면 도달", pageLabel: "공유 화면" },
] as const;

const RESPONSE_FUNNEL = [
  { key: "response_intro", label: "참여자 안내", pageLabel: "참여자 안내 화면" },
  { key: "response_identity", label: "일정 참여", pageLabel: "일정 참여 화면" },
  { key: "availability_input", label: "가능 시간 입력", pageLabel: "가능 시간 입력 화면" },
  { key: "response_review", label: "응답 확인", pageLabel: "응답 확인 화면" },
  { key: "response_waiting", label: "응답 대기", pageLabel: "응답 대기 화면" },
  { key: "calendar", label: "캘린더 도달", pageLabel: "캘린더 화면" },
] as const;

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
      pageLabel: "참여자 안내 화면",
      meetingId: segments[0] === "m" ? segments[1] ?? null : null,
    };
  }

  if (screenName === "response_identity") {
    return {
      pagePath,
      pageLabel: "일정 참여 화면",
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
    return { pagePath, pageLabel: "일정 만들기", meetingId: null };
  }

  if (segments[0] === "m" && segments[1]) {
    return { pagePath, pageLabel: "참여자 응답", meetingId: segments[1] };
  }

  if (segments[0] === "meetings" && segments[1] && segments[2] === "share") {
    return { pagePath, pageLabel: "공유 화면", meetingId: segments[1] };
  }

  if (segments[0] === "meetings" && segments[1] && segments[2] === "confirmed") {
    return { pagePath, pageLabel: "정해진 일정 화면", meetingId: segments[1] };
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
    geoCountry: row.geo_country ?? null,
    geoRegion: row.geo_region ?? null,
    geoCity: row.geo_city ?? null,
    geoTimezone: row.geo_timezone ?? null,
    createdAt: row.created_at,
  };
}

export function buildTrackingSummary(events: TrackingEvent[], now = new Date()): TrackingSummary {
  const todayKey = formatKstDateKey(now);
  const todayEvents = events.filter(
    (event) => formatKstDateKey(new Date(event.createdAt)) === todayKey,
  );
  const meetingCreationFunnel = buildFunnel(events, MEETING_CREATION_FUNNEL);
  const responseFunnel = buildFunnel(events, RESPONSE_FUNNEL);
  const firstKnownLocationEvents = getFirstKnownLocationEvents(events);

  return {
    totalCount: events.length,
    todayUniqueVisitorCount: countUniqueVisitors(todayEvents),
    uniqueVisitorCount: countUniqueVisitors(events),
    meetingCreationRate:
      meetingCreationFunnel.find((step) => step.key === "share")?.conversionRate ?? null,
    meetingCreationFunnel,
    responseFunnel,
    dropOffRows: buildDropOffRows([
      { label: "일정 생성", steps: meetingCreationFunnel },
      { label: "참여자 응답", steps: responseFunnel },
    ]),
    deviceVisitorCounts: countUniqueVisitorsBy(events, deviceTypeLabel),
    trafficSourceCounts: countFirstTouchTrafficSources(events),
    countryVisitorCounts: countUniqueVisitorsBy(
      firstKnownLocationEvents.filter((event) => event.geoCountry),
      countryLocationLabel,
    ),
    cityVisitorCounts: countUniqueVisitorsBy(
      firstKnownLocationEvents.filter(hasCityLocation),
      cityLocationLabel,
    ),
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

function buildFunnel(
  events: TrackingEvent[],
  steps: readonly { key: string; label: string; pageLabel: string }[],
): TrackingFunnelStep[] {
  const stageCounts = steps.map((step) => ({
    ...step,
    count: countUniqueVisitors(events.filter((event) => event.pageLabel === step.pageLabel)),
  }));
  const firstCount = stageCounts[0]?.count ?? 0;

  return stageCounts.map((step, index) => {
    const previous = index > 0 ? stageCounts[index - 1].count : null;
    const dropOffCount = previous === null ? null : Math.max(previous - step.count, 0);

    return {
      key: step.key,
      label: step.label,
      count: step.count,
      conversionRate: rate(step.count, firstCount),
      dropOffCount,
      dropOffRate: previous === null || dropOffCount === null ? null : rate(dropOffCount, previous),
    };
  });
}

function buildDropOffRows(funnels: { label: string; steps: TrackingFunnelStep[] }[]) {
  return funnels
    .flatMap((funnel) =>
      funnel.steps
        .map((step, index) => ({ step, previous: funnel.steps[index - 1] }))
        .filter(
          (
            row,
          ): row is {
            step: TrackingFunnelStep & { dropOffCount: number; dropOffRate: number };
            previous: TrackingFunnelStep;
          } =>
            row.previous !== undefined &&
            row.step.dropOffCount !== null &&
            row.step.dropOffRate !== null &&
            row.step.dropOffCount > 0,
        )
        .map(({ step, previous }) => ({
          key: `${funnel.label}:${step.key}`,
          label: `${funnel.label} · ${previous.label} → ${step.label}`,
          dropOffCount: step.dropOffCount,
          dropOffRate: step.dropOffRate,
        })),
    )
    .sort((a, b) => b.dropOffRate - a.dropOffRate || b.dropOffCount - a.dropOffCount)
    .slice(0, 5);
}

function countUniqueVisitors(events: TrackingEvent[]) {
  return new Set(events.map(uniqueVisitorKey).filter(Boolean)).size;
}

function countUniqueVisitorsBy(
  events: TrackingEvent[],
  keyOf: (event: TrackingEvent) => { key: string; label: string },
): TrackingCountRow[] {
  const counts = new Map<string, { label: string; visitors: Set<string> }>();

  for (const event of events) {
    const visitorKey = uniqueVisitorKey(event);
    if (!visitorKey) continue;

    const group = keyOf(event);
    const row = counts.get(group.key) ?? { label: group.label, visitors: new Set<string>() };
    row.visitors.add(visitorKey);
    counts.set(group.key, row);
  }

  return [...counts.entries()]
    .map(([key, row]) => ({ key, label: row.label, count: row.visitors.size }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 20);
}

function uniqueVisitorKey(event: TrackingEvent) {
  // 새 기록은 IP 해시 기준으로 중복 제거한다.
  // 기존 기록에는 IP 해시가 없어서, 그 기록만 기존 브라우저 방문자 ID로 계산한다.
  if (event.ipHash) return `ip:${event.ipHash}`;
  if (event.visitorId) return `visitor:${event.visitorId}`;
  return null;
}

function countFirstTouchTrafficSources(events: TrackingEvent[]): TrackingCountRow[] {
  const firstEventByVisitor = new Map<string, TrackingEvent>();
  const oldestFirst = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const event of oldestFirst) {
    const visitorKey = uniqueVisitorKey(event);
    if (!visitorKey || firstEventByVisitor.has(visitorKey)) continue;
    firstEventByVisitor.set(visitorKey, event);
  }

  return countUniqueVisitorsBy([...firstEventByVisitor.values()], trafficSourceLabel);
}

function getFirstKnownLocationEvents(events: TrackingEvent[]) {
  const firstEventByVisitor = new Map<string, TrackingEvent>();
  const oldestFirst = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const event of oldestFirst) {
    const visitorKey = uniqueVisitorKey(event);
    if (!visitorKey || firstEventByVisitor.has(visitorKey)) continue;
    if (!hasKnownLocation(event)) continue;
    firstEventByVisitor.set(visitorKey, event);
  }

  return [...firstEventByVisitor.values()];
}

function deviceTypeLabel(event: TrackingEvent) {
  if (event.deviceType === "mobile") return { key: "mobile", label: "모바일" };
  if (event.deviceType === "tablet") return { key: "tablet", label: "태블릿" };
  if (event.deviceType === "desktop") return { key: "desktop", label: "PC" };
  return { key: "unknown", label: "알 수 없음" };
}

function trafficSourceLabel(event: TrackingEvent) {
  if (!event.referrer) return { key: "direct", label: "직접/알 수 없음" };

  try {
    const host = new URL(event.referrer).hostname.toLowerCase().replace(/^www\./, "");
    return host ? { key: host, label: host } : { key: "unknown", label: "기타" };
  } catch {
    return { key: "unknown", label: "기타" };
  }
}

function countryLocationLabel(event: TrackingEvent) {
  const country = event.geoCountry ?? "unknown";
  return { key: country, label: country };
}

function cityLocationLabel(event: TrackingEvent) {
  const label = [event.geoCity, event.geoRegion, event.geoCountry].filter(Boolean).join(", ");
  const key = [event.geoCountry, event.geoRegion, event.geoCity].filter(Boolean).join("|");
  return { key, label: label || "unknown" };
}

function hasCityLocation(event: TrackingEvent) {
  return Boolean(event.geoCity || event.geoRegion || event.geoCountry);
}

function hasKnownLocation(event: TrackingEvent) {
  return Boolean(event.geoCountry || event.geoRegion || event.geoCity || event.geoTimezone);
}

function rate(part: number, total: number) {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
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

function formatKstTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
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
    const hour = formatKstTime(createdAt);
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}
