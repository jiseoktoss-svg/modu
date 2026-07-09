export interface TrackingGeoFields {
  geoCountry: string | null;
  geoRegion: string | null;
  geoCity: string | null;
  geoTimezone: string | null;
}

const MAX_GEO_VALUE_LENGTH = 120;

export function trackingGeoFromHeaders(headers: Headers): TrackingGeoFields {
  return {
    geoCountry: normalizeGeoHeader(headers.get("x-vercel-ip-country"))?.toUpperCase() ?? null,
    geoRegion: normalizeGeoHeader(headers.get("x-vercel-ip-country-region")),
    geoCity: normalizeGeoHeader(headers.get("x-vercel-ip-city")),
    geoTimezone: normalizeGeoHeader(headers.get("x-vercel-ip-timezone")),
  };
}

function normalizeGeoHeader(value: string | null) {
  if (!value) return null;

  const decoded = decodeGeoHeader(value);
  const trimmed = decoded.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") return null;

  return trimmed.slice(0, MAX_GEO_VALUE_LENGTH);
}

function decodeGeoHeader(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
