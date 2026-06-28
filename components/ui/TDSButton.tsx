"use client";

import {
  Button as BaseTDSButton,
  type ButtonProps as BaseTDSButtonProps,
  type TDSButtonColor,
  type TDSButtonSize,
  type TDSButtonVariant,
} from "@toss/tds-mobile";
import { cn } from "@/lib/cn";

type TDSButtonTone = "primary" | "secondary" | "ghost" | "danger" | "dark";
type TDSButtonScale = "sm" | "md" | "lg" | "xl";

const COLOR_BY_TONE: Record<TDSButtonTone, TDSButtonColor> = {
  primary: "primary",
  secondary: "light",
  ghost: "light",
  danger: "danger",
  dark: "dark",
};

const VARIANT_BY_TONE: Record<TDSButtonTone, TDSButtonVariant> = {
  primary: "fill",
  secondary: "fill",
  ghost: "weak",
  danger: "fill",
  dark: "fill",
};

const SIZE_BY_SCALE: Record<TDSButtonScale, TDSButtonSize> = {
  sm: "small",
  md: "medium",
  lg: "large",
  xl: "xlarge",
};

export interface TDSButtonProps
  extends Omit<BaseTDSButtonProps, "color" | "variant" | "size"> {
  tone?: TDSButtonTone;
  size?: TDSButtonScale;
  href?: string;
  target?: string;
  rel?: string;
}

export function TDSButton({
  tone = "primary",
  size = "xl",
  display = "inline",
  className,
  type,
  ...props
}: TDSButtonProps) {
  return (
    <BaseTDSButton
      type={type ?? "button"}
      color={COLOR_BY_TONE[tone]}
      variant={VARIANT_BY_TONE[tone]}
      size={SIZE_BY_SCALE[size]}
      display={display}
      data-tone={tone}
      className={cn("modu-tds-button", className)}
      {...props}
    />
  );
}
