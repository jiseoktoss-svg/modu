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
  /** true 면 데스크톱에서도 하단 고정(fixed) 바로 동작한다(기본: 모바일만 고정). */
  stickyDesktop?: boolean;
}

// 본문과 하단 고정 영역 사이에 둘 최소 여백(px).
const BOTTOM_GAP = 20;

export function MobileStickyAction({
  children,
  className,
  innerClassName,
  bleed = true,
  stickyDesktop = false,
  ...props
}: MobileStickyActionProps) {
  const actionRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(0);

  useLayoutEffect(() => {
    const node = actionRef.current;
    if (!node) return;

    // 모바일에서는 하단 고정 영역 높이 + 여백만큼 본문 아래 공간을 '항상' 확보한다.
    // window.innerHeight 에 의존하지 않으므로(주소창 표시/숨김에 따라 변하지 않음)
    // 스크롤 중 스페이서가 토글되며 스크롤 위치가 튀거나 되돌아가는 현상이 없다.
    const measure = () => {
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      const actionHeight = node.getBoundingClientRect().height;
      setSpacerHeight(isMobile || stickyDesktop ? actionHeight + BOTTOM_GAP : 0);
    };

    const scheduleMeasure = () => {
      window.requestAnimationFrame(measure);
    };

    scheduleMeasure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [stickyDesktop]);

  return (
    <div
      className={cn(
        "modu-mobile-sticky-action-slot",
        bleed && "-mx-4 sm:mx-0",
        stickyDesktop && "modu-sticky-action-desktop",
        className,
      )}
      {...props}
    >
      <div
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
