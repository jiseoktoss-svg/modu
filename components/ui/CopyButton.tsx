"use client";

import { useState } from "react";
import { TDSButton, type TDSButtonProps } from "@/components/ui/TDSButton";

type CopyButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface CopyButtonProps extends Omit<TDSButtonProps, "onClick" | "children" | "tone"> {
  value: string;
  label?: string;
  copiedLabel?: string;
  variant?: CopyButtonVariant;
}

const TONE_BY_VARIANT: Record<CopyButtonVariant, TDSButtonProps["tone"]> = {
  primary: "primary",
  secondary: "secondary",
  ghost: "ghost",
  danger: "danger",
};

export function CopyButton({
  value,
  label = "복사",
  copiedLabel = "복사됨",
  variant = "secondary",
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 클립보드 API 가 막힌 환경을 위한 폴백.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <TDSButton tone={TONE_BY_VARIANT[variant]} onClick={handleCopy} aria-live="polite" {...props}>
      {copied ? copiedLabel : label}
    </TDSButton>
  );
}
