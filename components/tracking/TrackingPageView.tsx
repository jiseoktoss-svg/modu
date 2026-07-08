"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackClientEvent } from "@/lib/clientTracking";

export function TrackingPageView() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/tracking") || pathname.startsWith("/api")) return;
    if (lastTrackedPath.current === pathname) return;

    lastTrackedPath.current = pathname;
    trackClientEvent({ eventName: "page_view", pagePath: pathname });
  }, [pathname]);

  return null;
}
