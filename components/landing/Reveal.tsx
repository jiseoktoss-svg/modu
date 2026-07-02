"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// AOS 느낌의 스크롤 등장: 뷰포트에 들어오면 아래→위 + blur→선명으로 한 번 나타난다.
// (외부 라이브러리 없이 IntersectionObserver 로 구현)
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number; // ms — 같은 섹션 안 요소들의 시차 등장용
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        shown
          ? "translate-y-0 opacity-100 blur-0"
          : "translate-y-6 opacity-0 blur-[6px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
