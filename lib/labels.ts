import type { AttendanceType, CellStatus } from "@/lib/types";
import type { ImpactStatus } from "@/lib/scheduler";

// 한국어 라벨 매핑 — 색상에만 의존하지 않도록 항상 텍스트 라벨을 함께 쓴다.

export const CELL_STATUS_LABEL: Record<CellStatus, string> = {
  available: "가능",
  busy: "불가능",
  avoid: "피하고 싶음",
  preferred: "선호",
};

export const IMPACT_STATUS_LABEL: Record<ImpactStatus, string> = {
  available: "가능",
  busy: "불가능",
  avoid: "피하고 싶음",
  preferred: "선호",
  pending: "미응답",
};

export const ATTENDANCE_LABEL: Record<AttendanceType, string> = {
  required: "필수",
  optional: "선택",
};
