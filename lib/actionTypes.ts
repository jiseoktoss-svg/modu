import type { AttendanceType, AvailabilityStatus } from "@/lib/types";

// 서버 액션의 인자/결과 타입. ("use server" 모듈은 async 함수만 export 할 수 있어
//  타입은 별도 모듈에 둔다.)

export type FormState = { error: string | null };

export interface SubmitBlockInput {
  startAt: string;
  endAt: string;
  status: AvailabilityStatus;
  note?: string | null;
}

export interface SubmitAvailabilityArgs {
  meetingId: string;
  participantId: string;
  token: string | null;
  memo?: string | null;
  blocks: SubmitBlockInput[];
}

export type SubmitResult =
  | { ok: true; participantId: string; token: string }
  | { ok: false; error: string };

export interface JoinMeetingArgs {
  meetingId: string;
  name: string;
}

export type JoinMeetingResult =
  | {
      ok: true;
      participantId: string;
      name: string;
      role: string;
      attendanceType: AttendanceType;
      responseStatus: "pending" | "submitted";
      token: string;
    }
  | { ok: false; error: string };

export type SimpleResult = { ok: true } | { ok: false; error: string };

export interface LoadResponseArgs {
  meetingId: string;
  participantId: string;
  token: string;
}

export type LoadResponseResult =
  | {
      ok: true;
      blocks: SubmitBlockInput[];
      memo: string | null;
      responseStatus: "pending" | "submitted";
    }
  | { ok: false; error: string };

export interface CalendarSnapshotParticipant {
  id: string;
  name: string;
  role: string;
  attendanceType: AttendanceType;
  responseStatus: "pending" | "submitted";
}

export interface CalendarSnapshotBlock {
  participantId: string;
  startAt: string;
  endAt: string;
  status: AvailabilityStatus;
}

export interface LoadCalendarSnapshotArgs {
  meetingId: string;
  participantId: string;
  token: string;
}

export type LoadCalendarSnapshotResult =
  | {
      ok: true;
      participants: CalendarSnapshotParticipant[];
      blocks: CalendarSnapshotBlock[];
    }
  | { ok: false; error: string };
