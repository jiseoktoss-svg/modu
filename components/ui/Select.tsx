"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// 기본 OS 화살표 대신 디자인 시스템 톤(DatePicker 셰브론과 동일)을 쓴다.
function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn("h-3.5 w-3.5", className)}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 4.5 6 7.5l3-3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface CustomOption {
  value: string;
  label: ReactNode;
}

interface MenuSelectProps {
  className?: string;
  value: string;
  options: CustomOption[];
  onValueChange: (value: string) => void;
  "aria-label"?: string;
  id?: string;
  disabled?: boolean;
}

// 커스텀 리스트 모드: 네이티브 select 대신 앵커드 드롭다운을 렌더한다.
// (트리거는 기존 <select> 와 시각적으로 1:1 매칭)
function MenuSelect({
  className,
  value,
  options,
  onValueChange,
  disabled,
  id,
  "aria-label": ariaLabel,
}: MenuSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [rect, setRect] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  const reactId = useId();
  const listboxId = `${id ?? "menuselect"}-${reactId}-listbox`;
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  function updateRect() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const MENU_MAX = 256; // 목록 최대 높이(px)
    const MARGIN = 8; // 뷰포트 가장자리 여백
    const spaceBelow = window.innerHeight - r.bottom - MARGIN;
    const spaceAbove = r.top - MARGIN;
    // 아래 공간이 부족하고 위가 더 넓으면 위로 연다(PC에서 화면 밖으로 나가는 것 방지).
    const openUp = spaceBelow < Math.min(MENU_MAX, 176) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(MENU_MAX, openUp ? spaceAbove : spaceBelow));
    if (openUp) {
      setRect({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight });
    } else {
      setRect({ left: r.left, width: r.width, top: r.bottom + 4, maxHeight });
    }
  }

  function openMenu() {
    if (disabled) return;
    updateRect();
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function closeMenu(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function commit(index: number) {
    const opt = options[index];
    if (!opt) return;
    onValueChange(opt.value);
    closeMenu();
  }

  // 열릴 때 좌표 재계산 + active 옵션으로 스크롤. 스크롤/리사이즈 시 좌표 갱신.
  useLayoutEffect(() => {
    if (!open) return;
    updateRect();
    const onScrollOrResize = () => updateRect();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  // 바깥 클릭으로 닫기(포커스 이동 없이).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeMenu();
        break;
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Tab":
        setOpen(false);
        break;
      default: {
        // 타이핑 점프(선택적): 첫 글자로 매칭되는 옵션 label 로 이동.
        if (e.key.length === 1) {
          const key = e.key.toLowerCase();
          const found = options.findIndex(
            (o) => typeof o.label === "string" && o.label.toLowerCase().startsWith(key),
          );
          if (found >= 0) {
            e.preventDefault();
            setActiveIndex(found);
          }
        }
      }
    }
  }

  const menu = open && rect ? (
    <ul
      ref={listRef}
      id={listboxId}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={optionId(activeIndex)}
      tabIndex={-1}
      onKeyDown={onListKeyDown}
      style={{
        position: "fixed",
        left: rect.left,
        width: rect.width,
        maxHeight: rect.maxHeight,
        ...(rect.top != null ? { top: rect.top } : { bottom: rect.bottom }),
      }}
      className="z-50 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl focus:outline-none"
    >
      {options.map((opt, i) => {
        const isSelected = opt.value === value;
        const isActive = i === activeIndex;
        return (
          <li
            key={opt.value}
            id={optionId(i)}
            ref={(el) => {
              optionRefs.current[i] = el;
            }}
            role="option"
            aria-selected={isSelected}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseDown={(e) => {
              // 트리거의 blur/바깥클릭 처리보다 먼저 선택되도록.
              e.preventDefault();
              commit(i);
            }}
            className={cn(
              "cursor-pointer px-3 py-2 text-sm",
              isSelected
                ? "bg-brand-500 font-bold text-white"
                : isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-700",
            )}
          >
            {opt.label}
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white pl-3 pr-10 text-base text-slate-900 sm:text-sm",
          "focus:border-2 focus:border-brand-400 focus:outline-none focus:ring-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span className="truncate">{selected ? selected.label : ""}</span>
      </button>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
        <ChevronDown className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </span>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  variant?: "native";
  options?: undefined;
  onValueChange?: undefined;
};

type MenuVariantProps = MenuSelectProps & {
  variant: "menu";
};

export type SelectProps = NativeSelectProps | MenuVariantProps;

export function Select(props: SelectProps) {
  // variant="menu" 이면 커스텀 리스트 모드, 아니면 네이티브 <select>.
  if (props.variant === "menu") {
    const { variant: _variant, ...menuProps } = props;
    return <MenuSelect {...menuProps} />;
  }

  const { className, children, variant: _v, ...rest } = props;
  return (
    <div className="relative">
      <select
        className={cn(
          "h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white pl-3 pr-10 text-base text-slate-900 sm:text-sm",
          "focus:border-2 focus:border-brand-400 focus:outline-none focus:ring-0",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
        <ChevronDown />
      </span>
    </div>
  );
}
