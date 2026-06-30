import "server-only";

import {
  MAX_MEETING_PARTICIPANTS,
  MIN_MEETING_PARTICIPANTS,
} from "@/lib/meetingLimits";
import { addDaysToDateStr, kstWallToIso, parseHm } from "@/lib/time";
import type { Meeting, Participant } from "@/lib/types";
import type { VoteOption } from "@/lib/actionTypes";

export const DEMO_MEETING_ID_PREFIX = "demo_";
export const DEMO_ADMIN_TOKEN = "demo-admin-token";

interface DemoParticipantInput {
  name: string;
  role: string;
  attendanceType: "required" | "optional";
}

interface DemoMeetingPayload {
  v: 1;
  title: string;
  agenda: string;
  location: string;
  durationMinutes: number;
  dateStart: string;
  dateEnd: string;
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  responseDeadline?: string | null;
  participants: DemoParticipantInput[];
}

export interface CreateDemoMeetingInput extends Omit<DemoMeetingPayload, "v"> {}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeString(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

export function isDemoMeetingId(meetingId: string) {
  return meetingId.startsWith(DEMO_MEETING_ID_PREFIX);
}

export function createDemoMeetingId(input: CreateDemoMeetingInput) {
  const payload: DemoMeetingPayload = { v: 1, ...input };
  return `${DEMO_MEETING_ID_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
}

function parseDemoMeetingPayload(meetingId: string): DemoMeetingPayload | null {
  if (!isDemoMeetingId(meetingId)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(meetingId.slice(DEMO_MEETING_ID_PREFIX.length)));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const payload = parsed as Partial<DemoMeetingPayload>;
  const durationMinutes = payload.durationMinutes;
  if (payload.v !== 1) return null;
  if (
    typeof payload.title !== "string" ||
    typeof payload.agenda !== "string" ||
    typeof payload.location !== "string" ||
    typeof payload.dateStart !== "string" ||
    typeof payload.dateEnd !== "string" ||
    typeof payload.workdayStart !== "string" ||
    typeof payload.workdayEnd !== "string" ||
    typeof payload.lunchStart !== "string" ||
    typeof payload.lunchEnd !== "string" ||
    typeof durationMinutes !== "number" ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    !isDateString(payload.dateStart) ||
    !isDateString(payload.dateEnd) ||
    !isTimeString(payload.workdayStart) ||
    !isTimeString(payload.workdayEnd) ||
    !isTimeString(payload.lunchStart) ||
    !isTimeString(payload.lunchEnd) ||
    !Array.isArray(payload.participants) ||
    payload.participants.length < MIN_MEETING_PARTICIPANTS ||
    payload.participants.length > MAX_MEETING_PARTICIPANTS
  ) {
    return null;
  }

  const participants: DemoParticipantInput[] = [];
  for (const participant of payload.participants) {
    if (typeof participant !== "object" || participant === null) return null;
    const p = participant as Partial<DemoParticipantInput>;
    if (
      typeof p.name !== "string" ||
      p.name.trim().length === 0 ||
      typeof p.role !== "string" ||
      (p.attendanceType !== "required" && p.attendanceType !== "optional")
    ) {
      return null;
    }
    participants.push({
      name: p.name.trim(),
      role: p.role.trim(),
      attendanceType: p.attendanceType,
    });
  }

  return {
    v: 1,
    title: payload.title,
    agenda: payload.agenda,
    location: payload.location,
    durationMinutes,
    dateStart: payload.dateStart,
    dateEnd: payload.dateEnd,
    workdayStart: payload.workdayStart,
    workdayEnd: payload.workdayEnd,
    lunchStart: payload.lunchStart,
    lunchEnd: payload.lunchEnd,
    responseDeadline:
      typeof payload.responseDeadline === "string" ? payload.responseDeadline : null,
    participants,
  };
}

export function getDemoMeeting(meetingId: string): Meeting | null {
  const payload = parseDemoMeetingPayload(meetingId);
  if (!payload) return null;

  return {
    id: meetingId,
    title: payload.title,
    agenda: payload.agenda,
    location: payload.location,
    durationMinutes: payload.durationMinutes,
    dateStart: payload.dateStart,
    dateEnd: payload.dateEnd,
    workdayStart: payload.workdayStart,
    workdayEnd: payload.workdayEnd,
    lunchStart: payload.lunchStart,
    lunchEnd: payload.lunchEnd,
    adminToken: DEMO_ADMIN_TOKEN,
    confirmedSlotId: null,
    createdAt: `${payload.dateStart}T00:00:00+09:00`,
    expiresAt: `${addDaysToDateStr(payload.dateStart, 30)}T00:00:00+09:00`,
    responseDeadline: payload.responseDeadline ?? null,
  };
}

export function getDemoParticipants(meetingId: string): Participant[] | null {
  const payload = parseDemoMeetingPayload(meetingId);
  if (!payload) return null;

  return payload.participants.map((participant, index) => ({
    id: `demo-p-${index + 1}`,
    meetingId,
    name: participant.name,
    role: participant.role,
    attendanceType: participant.attendanceType,
    responseStatus: "pending",
    participantToken: `demo-token-${index + 1}`,
    memo: null,
    createdAt: `${payload.dateStart}T00:00:00+09:00`,
    updatedAt: `${payload.dateStart}T00:00:00+09:00`,
  }));
}

export function getDemoVoteOptions(meetingId: string, participantId: string): VoteOption[] | null {
  const payload = parseDemoMeetingPayload(meetingId);
  const participants = getDemoParticipants(meetingId);
  if (!payload || !participants?.some((participant) => participant.id === participantId)) {
    return null;
  }

  const workStart = parseHm(payload.workdayStart);
  const duration = payload.durationMinutes;
  const firstStart = Math.min(workStart + 60, parseHm(payload.workdayEnd) - duration);
  const secondStart = Math.min(firstStart + 90, parseHm(payload.workdayEnd) - duration);
  const options = [firstStart, secondStart].filter((start, index, list) => {
    return start >= workStart && start + duration <= parseHm(payload.workdayEnd) && list.indexOf(start) === index;
  });

  return options.map((start, index) => ({
    startAt: kstWallToIso(payload.dateStart, start),
    endAt: kstWallToIso(payload.dateStart, start + duration),
    grade: index === 0 ? "A" : "B",
    reason:
      index === 0
        ? "데모 모드에서 확인할 수 있는 추천 후보입니다."
        : "비교용으로 제공되는 두 번째 데모 후보입니다.",
    voteCount: 0,
    userSelected: false,
  }));
}
