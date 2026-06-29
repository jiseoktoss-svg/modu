"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
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
  const actionRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(0);

  useLayoutEffect(() => {
    const node = actionRef.current;
    if (!node) return;

    const measure = () => {
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      const actionHeight = node.getBoundingClientRect().height;
      const currentSpacerHeight = spacerRef.current?.getBoundingClientRect().height ?? 0;
      const pageHeightWithoutSpacer =
        document.documentElement.scrollHeight - currentSpacerHeight;
      const needsScrollPadding =
        isMobile && pageHeightWithoutSpacer > window.innerHeight + 1;

      setSpacerHeight(needsScrollPadding ? actionHeight : 0);
    };

    const scheduleMeasure = () => {
      window.requestAnimationFrame(measure);
    };

    scheduleMeasure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(document.body);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, []);

  return (
    <div
      className={cn("modu-mobile-sticky-action-slot", bleed && "-mx-4 sm:mx-0", className)}
      {...props}
    >
      <div
        ref={spacerRef}
        aria-hidden="true"
        className="modu-mobile-sticky-action-spacer"
        style={spacerHeight > 0 ? { height: spacerHeight } : undefined}
      />
      <div ref={actionRef} className="modu-mobile-sticky-action">
        <div className={cn("mx-auto w-full", innerClassName)}>{children}</div>
      </div>
    </div>
  );
}
