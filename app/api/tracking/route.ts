import { NextRequest, NextResponse } from "next/server";
import { trackingGeoFromHeaders } from "@/lib/trackingGeo";
import { clientIpHashFromHeaders } from "@/lib/trackingIp";
import { recordTrackingEvent } from "@/lib/tracking";
import { isTrackingEventName } from "@/lib/trackingModel";

interface TrackingPayload {
  eventName?: unknown;
  pagePath?: unknown;
  screenName?: unknown;
  meetingId?: unknown;
  visitorId?: unknown;
  sessionId?: unknown;
  referrer?: unknown;
  viewportWidth?: unknown;
}

export async function POST(request: NextRequest) {
  let payload: TrackingPayload;
  try {
    payload = (await request.json()) as TrackingPayload;
  } catch (error) {
    console.error("[tracking] invalid request body", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!isTrackingEventName(payload.eventName) || !isString(payload.pagePath)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (payload.pagePath.startsWith("/tracking") || payload.pagePath.startsWith("/api")) {
    return NextResponse.json({ ok: true });
  }

  const geo = trackingGeoFromHeaders(request.headers);

  const result = await recordTrackingEvent({
    eventName: payload.eventName,
    pagePath: payload.pagePath,
    screenName: nullableString(payload.screenName),
    meetingId: nullableString(payload.meetingId),
    ipHash: clientIpHashFromHeaders(request.headers),
    visitorId: nullableString(payload.visitorId),
    sessionId: nullableString(payload.sessionId),
    referrer: nullableString(payload.referrer) ?? request.headers.get("referer"),
    userAgent: request.headers.get("user-agent"),
    viewportWidth:
      typeof payload.viewportWidth === "number" ? payload.viewportWidth : null,
    ...geo,
  });

  return NextResponse.json({ ok: result.ok }, { status: result.ok ? 200 : 202 });
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
