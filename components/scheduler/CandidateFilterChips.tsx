"use client";

import { cn } from "@/lib/cn";
import {
  CANDIDATE_FILTER_OPTIONS,
  type CandidateFilter,
} from "@/lib/scheduler/candidateFilters";

// 추천안 후보 리스트 필터 칩 — 그룹별로 나눠 보는 탐색 보조 기능(투표/확정 아님).
// 후보가 없는 필터는 숨기지 않고 disabled 로 둔다(어떤 분류가 있는지 이해를 돕기 위해).

type CandidateFilterChipsProps = {
  value: CandidateFilter;
  counts: Record<CandidateFilter, number>;
  onChange: (value: CandidateFilter) => void;
};

export function CandidateFilterChips({ value, counts, onChange }: CandidateFilterChipsProps) {
  return (
    <div
      role="group"
      aria-label="후보 필터"
      className="modu-scrollbar-hide flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {CANDIDATE_FILTER_OPTIONS.map((filter) => {
        const selected = value === filter.value;
        const count = counts[filter.value];
        return (
          <button
            key={filter.value}
            type="button"
            disabled={count === 0}
            onClick={() => onChange(filter.value)}
            aria-pressed={selected}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
              selected
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              count === 0 && "cursor-not-allowed opacity-40",
            )}
          >
            {filter.label} {count}
          </button>
        );
      })}
    </div>
  );
}
