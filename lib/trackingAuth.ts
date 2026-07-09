import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const TRACKING_AUTH_COOKIE = "modu_tracking_auth";

const TOKEN_INPUT = "modu-tracking-dashboard";

export function hasTrackingPassword() {
  return getTrackingPassword() !== null;
}

export function canBypassTrackingAuthLocally() {
  return process.env.NODE_ENV === "development";
}

export function verifyTrackingPassword(candidate: string) {
  const password = getTrackingPassword();
  if (!password) return false;

  const expected = digest(password);
  const actual = digest(candidate);
  return timingSafeEqual(expected, actual);
}

export function createTrackingAuthToken() {
  const password = getTrackingPassword();
  if (!password) throw new Error("TRACKING_PASSWORD is not configured.");
  return createHmac("sha256", password).update(TOKEN_INPUT).digest("hex");
}

export async function hasTrackingAccess() {
  if (canBypassTrackingAuthLocally()) return true;
  if (!hasTrackingPassword()) return false;
  const store = await cookies();
  return store.get(TRACKING_AUTH_COOKIE)?.value === createTrackingAuthToken();
}

function getTrackingPassword() {
  const value = process.env.TRACKING_PASSWORD?.trim();
  return value && value.length >= 8 ? value : null;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}
