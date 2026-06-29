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
  const [actionHeight, setActionHeight] = useState(0);

  useLayoutEffect(() => {
    const node = actionRef.current;
    if (!node) return;

    const measure = () => {
      setActionHeight(node.getBoundingClientRect().height);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div
      className={cn("modu-mobile-sticky-action-slot", bleed && "-mx-4 sm:mx-0", className)}
      {...props}
    >
      <div
        aria-hidden="true"
        className="modu-mobile-sticky-action-spacer"
        style={actionHeight > 0 ? { height: actionHeight } : undefined}
      />
      <div ref={actionRef} className="modu-mobile-sticky-action">
        <div className={cn("mx-auto w-full", innerClassName)}>{children}</div>
      </div>
    </div>
  );
}
