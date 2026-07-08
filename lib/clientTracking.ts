import type { TrackingEventName } from "@/lib/trackingModel";

const VISITOR_ID_KEY = "modu:tracking:visitor-id";
const SESSION_ID_KEY = "modu:tracking:session-id";

interface ClientTrackingInput {
  eventName: TrackingEventName;
  pagePath?: string;
  screenName?: string;
  meetingId?: string | null;
}

export function trackClientEvent(input: ClientTrackingInput) {
  if (typeof window === "undefined") return;

  const payload = {
    eventName: input.eventName,
    pagePath: input.pagePath ?? window.location.pathname,
    screenName: input.screenName ?? null,
    meetingId: input.meetingId ?? null,
    visitorId: getStoredId(window.localStorage, VISITOR_ID_KEY),
    sessionId: getStoredId(window.sessionStorage, SESSION_ID_KEY),
    referrer: document.referrer || null,
    viewportWidth: window.innerWidth,
  };

  const body = JSON.stringify(payload);
  const url = "/api/tracking";

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(url, blob);
    return;
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch((error) => {
    console.error("[tracking] failed to send event", error);
  });
}

function getStoredId(storage: Storage, key: string) {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;

    const next = createId();
    storage.setItem(key, next);
    return next;
  } catch (error) {
    console.warn("[tracking] browser storage is unavailable", error);
    return createId();
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
