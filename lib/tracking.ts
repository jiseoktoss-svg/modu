import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { TrackingEventRow } from "@/lib/types";
import {
  buildTrackingSummary,
  detectDeviceType,
  getTrackingPageMeta,
  isTrackingEventName,
  mapTrackingEvent,
  type TrackingEvent,
  type TrackingEventName,
  type TrackingSummary,
} from "@/lib/trackingModel";

const MAX_TRACKING_EVENTS = 1000;
const MAX_TEXT_LENGTH = 500;
const CLEAR_ALL_EVENT_NAME_SENTINEL = "__clear_all_tracking_events__";

export interface RecordTrackingEventInput {
  eventName: TrackingEventName;
  pagePath: string;
  screenName?: string | null;
  meetingId?: string | null;
  ipHash?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  viewportWidth?: number | null;
  geoCountry?: string | null;
  geoRegion?: string | null;
  geoCity?: string | null;
  geoTimezone?: string | null;
}

export async function recordTrackingEvent(
  input: RecordTrackingEventInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isTrackingEventName(input.eventName)) {
    return { ok: false, error: "Unsupported tracking event." };
  }

  const pageMeta = getTrackingPageMeta(input.pagePath, input.screenName);
  const userAgent = trimNullable(input.userAgent);
  const viewportWidth =
    typeof input.viewportWidth === "number" && Number.isFinite(input.viewportWidth)
      ? Math.round(input.viewportWidth)
      : null;

  const row = {
    event_name: input.eventName,
    page_path: pageMeta.pagePath,
    page_label: pageMeta.pageLabel,
    meeting_id: trimNullable(input.meetingId) ?? pageMeta.meetingId,
    ip_hash: trimNullable(input.ipHash),
    visitor_id: trimNullable(input.visitorId),
    session_id: trimNullable(input.sessionId),
    referrer: trimNullable(input.referrer),
    user_agent: userAgent,
    device_type: detectDeviceType(userAgent),
    viewport_width: viewportWidth,
    geo_country: trimNullable(input.geoCountry),
    geo_region: trimNullable(input.geoRegion),
    geo_city: trimNullable(input.geoCity),
    geo_timezone: trimNullable(input.geoTimezone),
  };

  const { error } = await getSupabaseAdmin().from("tracking_events").insert(row);
  if (error) {
    console.error("[tracking] failed to record event", error);
    return { ok: false, error: "Tracking event could not be saved." };
  }

  return { ok: true };
}

export async function fetchTrackingEvents(
  limit = MAX_TRACKING_EVENTS,
): Promise<TrackingEvent[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("tracking_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as TrackingEventRow[]).map(mapTrackingEvent);
}

export async function fetchTrackingSummary(): Promise<TrackingSummary> {
  const events = await fetchTrackingEvents();
  return buildTrackingSummary(events);
}

export async function clearTrackingEvents(): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("tracking_events")
    .delete()
    .neq("event_name", CLEAR_ALL_EVENT_NAME_SENTINEL);

  if (error) throw error;
}

function trimNullable(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, MAX_TEXT_LENGTH) : null;
}
