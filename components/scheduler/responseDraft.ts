// v2: 투표 개념 제거로 resultSelectedIndex/resultVotedIndex 필드 삭제(구버전 드래프트는 폐기).
export const RESPONSE_DRAFT_VERSION = 3;

export type ResponseDraftStep =
  | "intro"
  | "identity"
  | "availability"
  | "review"
  | "waiting"
  | "result"
  | "done";

export type ResponseTimeRangeDraft = {
  start: number;
  end: number;
};

export interface ResponseDraft {
  version: typeof RESPONSE_DRAFT_VERSION;
  meetingId: string;
  step: ResponseDraftStep;
  caseId: number;
  selectedId: string | null;
  token: string | null;
  identityName: string;
  availStep: number;
  maxAvailStep: number;
  busyDates: string[];
  dateTimeBusy: Record<string, ResponseTimeRangeDraft[]>;
  dtDate: string | null;
  draftStart: string;
  draftEnd: string;
  savedAt: string;
}

type ResponseDraftInput = Omit<ResponseDraft, "version" | "savedAt">;

function responseDraftStorageKey(meetingId: string): string {
  return `modu:response-draft:${meetingId}:v1`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isStep(value: unknown): value is ResponseDraftStep {
  return (
    value === "intro" ||
    value === "identity" ||
    value === "availability" ||
    value === "review" ||
    value === "waiting" ||
    value === "result" ||
    value === "done"
  );
}

function isStepIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1;
}

function isCaseId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

function isDateList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isTimeRange(value: unknown): value is ResponseTimeRangeDraft {
  return (
    isRecord(value) &&
    typeof value.start === "number" &&
    Number.isInteger(value.start) &&
    typeof value.end === "number" &&
    Number.isInteger(value.end) &&
    value.end > value.start
  );
}

function isDateTimeBusy(value: unknown): value is Record<string, ResponseTimeRangeDraft[]> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([date, ranges]) => isString(date) && Array.isArray(ranges) && ranges.every(isTimeRange),
    )
  );
}

function parseResponseDraft(raw: string, meetingId: string): ResponseDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (parsed.version !== RESPONSE_DRAFT_VERSION) return null;
  if (parsed.meetingId !== meetingId) return null;
  if (!isStep(parsed.step)) return null;
  if (!isCaseId(parsed.caseId)) return null;
  if (!isNullableString(parsed.selectedId)) return null;
  if (!isNullableString(parsed.token)) return null;
  if (!isString(parsed.identityName)) return null;
  if (!isStepIndex(parsed.availStep)) return null;
  if (!isStepIndex(parsed.maxAvailStep)) return null;
  if (parsed.maxAvailStep < parsed.availStep) return null;
  if (!isDateList(parsed.busyDates)) return null;
  if (!isDateTimeBusy(parsed.dateTimeBusy)) return null;
  if (!isNullableString(parsed.dtDate)) return null;
  if (!isString(parsed.draftStart)) return null;
  if (!isString(parsed.draftEnd)) return null;
  if (!isString(parsed.savedAt)) return null;

  return {
    version: RESPONSE_DRAFT_VERSION,
    meetingId,
    step: parsed.step,
    caseId: parsed.caseId,
    selectedId: parsed.selectedId,
    token: parsed.token,
    identityName: parsed.identityName,
    availStep: parsed.availStep,
    maxAvailStep: parsed.maxAvailStep,
    busyDates: parsed.busyDates,
    dateTimeBusy: parsed.dateTimeBusy,
    dtDate: parsed.dtDate,
    draftStart: parsed.draftStart,
    draftEnd: parsed.draftEnd,
    savedAt: parsed.savedAt,
  };
}

export function readResponseDraft(storage: Storage, meetingId: string): ResponseDraft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(responseDraftStorageKey(meetingId));
  } catch {
    return null;
  }
  if (!raw) return null;

  const draft = parseResponseDraft(raw, meetingId);
  if (!draft) {
    clearResponseDraft(storage, meetingId);
    return null;
  }

  return draft;
}

export function writeResponseDraft(
  storage: Storage,
  draft: ResponseDraftInput,
): boolean {
  try {
    storage.setItem(
      responseDraftStorageKey(draft.meetingId),
      JSON.stringify({
        ...draft,
        version: RESPONSE_DRAFT_VERSION,
        savedAt: new Date().toISOString(),
      } satisfies ResponseDraft),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearResponseDraft(storage: Storage, meetingId: string): boolean {
  try {
    storage.removeItem(responseDraftStorageKey(meetingId));
    return true;
  } catch {
    return false;
  }
}
