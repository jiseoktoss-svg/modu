import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface MobileStickyActionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  innerClassName?: string;
  bleed?: boolean;
}

export function MobileStickyAction({
  children,
  className,
  innerClassName,
  bleed = true,
  ...props
}: MobileStickyActionProps) {
  return (
    <div
      className={cn("modu-mobile-sticky-action", bleed && "-mx-4 sm:mx-0", className)}
      {...props}
    >
      <div className={cn("mx-auto w-full", innerClassName)}>{children}</div>
    </div>
  );
}
