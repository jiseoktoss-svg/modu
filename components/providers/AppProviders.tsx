"use client";

import type { ReactNode } from "react";
import { TDSMobileAITProvider } from "@toss/tds-mobile-ait";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <TDSMobileAITProvider
      brandPrimaryColor="#3182f6"
      fontScaleAvailable={false}
      resetGlobalCss={false}
    >
      {children}
    </TDSMobileAITProvider>
  );
}
