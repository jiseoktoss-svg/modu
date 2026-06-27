import type { CellStatus } from "@/lib/types";
import type { ImpactStatus } from "@/lib/scheduler";
import type { BadgeTone } from "@/components/ui/Badge";

// 상태별 시각 스타일. 색상은 보조 수단이며 항상 라벨/약어와 함께 쓴다.

export const CELL_STATUS_STYLE: Record<
  CellStatus,
  { cell: string; swatch: string; abbrev: string }
> = {
  available: {
    cell: "bg-white text-slate-300 hover:bg-slate-100",
    swatch: "bg-white border border-slate-300",
    abbrev: "",
  },
  busy: {
    cell: "bg-red-200 text-red-800 hover:bg-red-300",
    swatch: "bg-red-300",
    abbrev: "불가",
  },
  avoid: {
    cell: "bg-amber-200 text-amber-800 hover:bg-amber-300",
    swatch: "bg-amber-300",
    abbrev: "피함",
  },
  preferred: {
    cell: "bg-blue-200 text-blue-800 hover:bg-blue-300",
    swatch: "bg-blue-300",
    abbrev: "선호",
  },
};

export const IMPACT_STATUS_TONE: Record<ImpactStatus, BadgeTone> = {
  available: "green",
  busy: "red",
  avoid: "amber",
  preferred: "blue",
  pending: "gray",
};
