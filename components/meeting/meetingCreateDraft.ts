export const MEETING_CREATE_DRAFT_STORAGE_KEY = "modu:meeting-create-draft:v1";
export const MEETING_CREATE_DRAFT_LAST_STEP = 5;

const MEETING_CREATE_DRAFT_VERSION = 2;

export interface MeetingCreateDraft {
  version: typeof MEETING_CREATE_DRAFT_VERSION;
  title: string;
  agenda: string;
  location: string;
  deadlineDate: string;
  responseDeadlineDate: string;
  responseDeadlineTime: string;
  durationHours: string;
  durationMinute: string;
  step: number;
  maxStep: number;
  confirming: boolean;
  savedAt: string;
}

type MeetingCreateDraftInput = Omit<MeetingCreateDraft, "version" | "savedAt">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isValidStep(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MEETING_CREATE_DRAFT_LAST_STEP
  );
}

function parseMeetingCreateDraft(raw: string): MeetingCreateDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (parsed.version !== MEETING_CREATE_DRAFT_VERSION) return null;
  if (!isString(parsed.title)) return null;
  if (!isString(parsed.agenda)) return null;
  if (!isString(parsed.location)) return null;
  if (!isString(parsed.deadlineDate)) return null;
  if (!isString(parsed.responseDeadlineDate)) return null;
  if (!isString(parsed.responseDeadlineTime)) return null;
  if (!isString(parsed.durationHours)) return null;
  if (!isString(parsed.durationMinute)) return null;
  if (!isValidStep(parsed.step)) return null;
  if (!isValidStep(parsed.maxStep)) return null;
  if (parsed.maxStep < parsed.step) return null;
  if (typeof parsed.confirming !== "boolean") return null;
  if (!isString(parsed.savedAt)) return null;

  return {
    version: MEETING_CREATE_DRAFT_VERSION,
    title: parsed.title,
    agenda: parsed.agenda,
    location: parsed.location,
    deadlineDate: parsed.deadlineDate,
    responseDeadlineDate: parsed.responseDeadlineDate,
    responseDeadlineTime: parsed.responseDeadlineTime,
    durationHours: parsed.durationHours,
    durationMinute: parsed.durationMinute,
    step: parsed.step,
    maxStep: parsed.maxStep,
    confirming: parsed.confirming,
    savedAt: parsed.savedAt,
  };
}

export function readMeetingCreateDraft(storage: Storage): MeetingCreateDraft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(MEETING_CREATE_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  const draft = parseMeetingCreateDraft(raw);
  if (!draft) {
    clearMeetingCreateDraft(storage);
    return null;
  }

  return draft;
}

export function writeMeetingCreateDraft(
  storage: Storage,
  draft: MeetingCreateDraftInput,
): boolean {
  try {
    storage.setItem(
      MEETING_CREATE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ...draft,
        version: MEETING_CREATE_DRAFT_VERSION,
        savedAt: new Date().toISOString(),
      } satisfies MeetingCreateDraft),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearMeetingCreateDraft(storage: Storage): boolean {
  try {
    storage.removeItem(MEETING_CREATE_DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
