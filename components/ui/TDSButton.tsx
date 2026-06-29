"use client";

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  MouseEvent,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type TDSButtonTone = "primary" | "secondary" | "ghost" | "danger" | "dark";
type TDSButtonScale = "sm" | "md" | "lg" | "xl";
type TDSButtonDisplay = "inline" | "block";

const TONE_CLASS: Record<TDSButtonTone, string> = {
  primary:
    "bg-brand-500 text-white shadow-sm shadow-brand-500/20 focus-visible:ring-brand-300",
  secondary:
    "border border-slate-200 bg-slate-100 text-slate-800 focus-visible:ring-slate-300",
  ghost: "bg-transparent text-slate-700 focus-visible:ring-slate-300",
  danger: "bg-red-600 text-white shadow-sm shadow-red-600/20 focus-visible:ring-red-300",
  dark: "bg-slate-900 text-white shadow-sm shadow-slate-900/20 focus-visible:ring-slate-400",
};

const SIZE_CLASS: Record<TDSButtonScale, string> = {
  sm: "h-9 rounded-xl px-3 text-sm",
  md: "h-10 rounded-xl px-4 text-sm",
  lg: "h-12 rounded-2xl px-5 text-base",
  xl: "h-14 rounded-[18px] px-6 text-base",
};

export interface TDSButtonProps extends Omit<HTMLAttributes<HTMLElement>, "color"> {
  as?: "button" | "a";
  children?: ReactNode;
  disabled?: boolean;
  display?: TDSButtonDisplay;
  href?: string;
  loading?: boolean;
  rel?: string;
  size?: TDSButtonScale;
  target?: string;
  tone?: TDSButtonTone;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  download?: AnchorHTMLAttributes<HTMLAnchorElement>["download"];
}

function LoadingDot() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80 motion-reduce:animate-none"
    />
  );
}

export function TDSButton({
  as,
  children,
  className,
  disabled,
  display = "inline",
  href,
  loading = false,
  rel,
  size = "xl",
  target,
  tone = "primary",
  type,
  ...props
}: TDSButtonProps) {
  const isAnchor = as === "a" || typeof href === "string";
  const isDisabled = Boolean(disabled || loading);
  const buttonClassName = cn(
    "modu-tds-button inline-flex items-center justify-center gap-2 font-bold transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
    display === "block" ? "w-full" : "w-auto",
    SIZE_CLASS[size],
    TONE_CLASS[tone],
    className,
  );
  const content = (
    <>
      {loading && <LoadingDot />}
      <span className="min-w-0 truncate">{children}</span>
    </>
  );

  if (isAnchor) {
    const anchorProps = props as AnchorHTMLAttributes<HTMLAnchorElement>;

    return (
      <a
        {...anchorProps}
        href={isDisabled ? undefined : href}
        target={target}
        rel={rel ?? (target === "_blank" ? "noreferrer" : undefined)}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        data-tone={tone}
        className={buttonClassName}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          if (isDisabled) {
            event.preventDefault();
            return;
          }
          anchorProps.onClick?.(event);
        }}
      >
        {content}
      </a>
    );
  }

  const buttonProps = props as ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <button
      {...buttonProps}
      type={type ?? "button"}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-tone={tone}
      className={buttonClassName}
    >
      {content}
    </button>
  );
}
