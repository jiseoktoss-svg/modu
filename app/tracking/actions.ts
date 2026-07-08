"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearTrackingEvents } from "@/lib/tracking";
import {
  TRACKING_AUTH_COOKIE,
  createTrackingAuthToken,
  hasTrackingAccess,
  hasTrackingPassword,
  verifyTrackingPassword,
} from "@/lib/trackingAuth";

export async function loginTracking(formData: FormData) {
  if (!hasTrackingPassword()) redirect("/tracking?setup=1");

  const password = String(formData.get("password") ?? "");
  if (!verifyTrackingPassword(password)) redirect("/tracking?error=1");

  const store = await cookies();
  store.set(TRACKING_AUTH_COOKIE, createTrackingAuthToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/tracking",
    maxAge: 60 * 60 * 12,
  });

  redirect("/tracking");
}

export async function logoutTracking() {
  const store = await cookies();
  store.set(TRACKING_AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/tracking",
    maxAge: 0,
  });

  redirect("/tracking");
}

export async function clearTrackingEventsAction() {
  if (!(await hasTrackingAccess())) redirect("/tracking");

  try {
    await clearTrackingEvents();
  } catch (error) {
    console.error("[tracking] failed to clear events", error);
    redirect("/tracking?clearError=1");
  }

  redirect("/tracking?cleared=1");
}
