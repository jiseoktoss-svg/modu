"use client";

import type { ReactNode } from "react";
import { TrackingPageView } from "@/components/tracking/TrackingPageView";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <>
      <TrackingPageView />
      {children}
    </>
  );
}
