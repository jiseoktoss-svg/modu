import type {
  AttendanceType,
  AvailabilityStatus,
  ResponseStatus,
} from "@/lib/types";

// 추천 알고리즘 입력/출력 타입. UI/DB 와 분리해 단위 테스트가 쉽도록 한다.

export interface SchedulerMeeting {
  durationMinutes: number;
  dateStart: string; // YYYY-MM-DD
  dateEnd: string; // YYYY-MM-DD
  workdayStart: string; // HH:MM
  workdayEnd: string; // HH:MM
  lunchStart: string; // HH:MM
  lunchEnd: string; // HH:MM
}

export interface SchedulerParticipant {
  id: string;
  name: string;
  attendanceType: AttendanceType;
  responseStatus: ResponseStatus;
}

export interface SchedulerBlock {
  participantId: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: AvailabilityStatus;
}

export interface SchedulerInput {
  meeting: SchedulerMeeting;
  participants: SchedulerParticipant[];
  blocks: SchedulerBlock[];
  /** 추천 후보 최대 개수. 기본 5. */
  maxCandidates?: number;
}

export type RecommendationGrade =
  | "best" // 가장 추천
  | "recommended" // 추천
  | "conditional" // 조건부 추천
  | "caution"; // 주의 필요

export type ImpactStatus =
  | "available"
  | "busy"
  | "avoid"
  | "preferred"
  | "pending";

export interface ParticipantImpact {
  participantId: string;
  name: string;
  attendanceType: AttendanceType;
  status: ImpactStatus;
}

export interface SlotCandidate {
  startAt: string; // ISO (+09:00)
  endAt: string; // ISO (+09:00)
  score: number;
  grade: RecommendationGrade;

  requiredTotalCount: number;
  requiredAvailableCount: number;
  requiredAllAvailable: boolean;

  optionalTotalCount: number;
  optionalAvailableCount: number;
  busyOptionalCount: number;

  avoidConflictCount: number;
  preferredCount: number;
  afterLunch: boolean;

  pendingCount: number;
  hasPendingParticipants: boolean;

  impacts: ParticipantImpact[];
  reason: string;
}

export const GRADE_LABELS: Record<RecommendationGrade, string> = {
  best: "가장 추천",
  recommended: "추천",
  conditional: "조건부 추천",
  caution: "주의 필요",
};
