// modu 도메인 타입.
// DB(Postgres)는 snake_case 컬럼을 쓰고, 애플리케이션 코드는 camelCase 를 쓴다.
// Row* 타입은 DB 응답 형태이고, 도메인 타입은 매핑 후 형태다.

export type AttendanceType = "required" | "optional";
export type ResponseStatus = "pending" | "submitted";

/** DB 에 실제 저장되는 상태. `available` 은 기본값이라 저장하지 않는다. */
export type AvailabilityStatus = "busy" | "avoid" | "preferred";

/** 시간표 한 칸이 가질 수 있는 UI 상태. */
export type CellStatus = "available" | AvailabilityStatus;

export interface Meeting {
  id: string;
  title: string;
  agenda: string;
  location: string;
  durationMinutes: number;
  dateStart: string; // YYYY-MM-DD
  dateEnd: string; // YYYY-MM-DD
  workdayStart: string; // HH:MM
  workdayEnd: string; // HH:MM
  lunchStart: string; // HH:MM
  lunchEnd: string; // HH:MM
  adminToken: string;
  confirmedSlotId: string | null;
  createdAt: string;
  expiresAt: string;
  /** 응답 마감 시각(ISO +09:00). 미설정이면 null. */
  responseDeadline: string | null;
}

export interface Participant {
  id: string;
  meetingId: string;
  name: string;
  role: string;
  attendanceType: AttendanceType;
  responseStatus: ResponseStatus;
  participantToken: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityBlock {
  id: string;
  meetingId: string;
  participantId: string;
  startAt: string; // ISO timestamptz
  endAt: string; // ISO timestamptz
  status: AvailabilityStatus;
  note: string | null;
  createdAt: string;
}

export interface ConfirmedSlot {
  id: string;
  meetingId: string;
  startAt: string;
  endAt: string;
  summaryText: string;
  createdAt: string;
}

export interface MeetingVote {
  id: string;
  meetingId: string;
  participantId: string;
  startAt: string;
  endAt: string;
  createdAt: string;
}

// ---- DB Row 타입 ----

export interface MeetingRow {
  id: string;
  title: string;
  agenda: string | null;
  location: string | null;
  duration_minutes: number;
  date_start: string;
  date_end: string;
  workday_start: string;
  workday_end: string;
  lunch_start: string;
  lunch_end: string;
  admin_token: string;
  confirmed_slot_id: string | null;
  created_at: string;
  expires_at: string;
  response_deadline?: string | null;
}

export interface ParticipantRow {
  id: string;
  meeting_id: string;
  name: string;
  role: string;
  attendance_type: AttendanceType;
  response_status: ResponseStatus;
  participant_token: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityBlockRow {
  id: string;
  meeting_id: string;
  participant_id: string;
  start_at: string;
  end_at: string;
  status: AvailabilityStatus;
  note: string | null;
  created_at: string;
}

export interface ConfirmedSlotRow {
  id: string;
  meeting_id: string;
  start_at: string;
  end_at: string;
  summary_text: string;
  created_at: string;
}

export interface MeetingVoteRow {
  id: string;
  meeting_id: string;
  participant_id: string;
  start_at: string;
  end_at: string;
  created_at: string;
}

// ---- 매퍼 ----

export function mapMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    title: row.title,
    agenda: row.agenda ?? "",
    location: row.location ?? "",
    durationMinutes: row.duration_minutes,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    // Postgres `time` 은 'HH:MM:SS' 로 오므로 HH:MM 로 자른다.
    workdayStart: row.workday_start.slice(0, 5),
    workdayEnd: row.workday_end.slice(0, 5),
    lunchStart: row.lunch_start.slice(0, 5),
    lunchEnd: row.lunch_end.slice(0, 5),
    adminToken: row.admin_token,
    confirmedSlotId: row.confirmed_slot_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    responseDeadline: row.response_deadline ?? null,
  };
}

export function mapParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    name: row.name,
    role: row.role,
    attendanceType: row.attendance_type,
    responseStatus: row.response_status,
    participantToken: row.participant_token,
    memo: row.memo ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAvailabilityBlock(row: AvailabilityBlockRow): AvailabilityBlock {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    participantId: row.participant_id,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function mapConfirmedSlot(row: ConfirmedSlotRow): ConfirmedSlot {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    startAt: row.start_at,
    endAt: row.end_at,
    summaryText: row.summary_text,
    createdAt: row.created_at,
  };
}

export function mapMeetingVote(row: MeetingVoteRow): MeetingVote {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    participantId: row.participant_id,
    startAt: row.start_at,
    endAt: row.end_at,
    createdAt: row.created_at,
  };
}
