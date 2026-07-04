// 특정 날짜·시간의 참석 가능 여부 조회.
// 추천 후보(rankGroups/calendarMarks)에 없는 시간이라도 참석자 응답만으로 직접 계산한다.
// 검색(탐색 보조) 기능의 계산 코어 — modu 는 여전히 회의 시간을 확정하지 않는다.
// 데모 케이스(buildCaseSnapshot)와 실제 데이터(loadCalendarSnapshot) 모두 이 함수를 재사용한다.

export type AvailabilityLookupParticipant = {
  id: string;
  name: string;
  role: string;
  attendanceType: "required" | "optional";
  responseStatus: "pending" | "submitted";
};

export type AvailabilityLookupBlock = {
  participantId: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: "busy" | "avoid" | "preferred";
};

export type AvailabilityLookupResult = {
  date: string; // YYYY-MM-DD (KST — startAt 은 +09:00 벽시계로 만들어진다)
  startAt: string;
  endAt: string;

  totalParticipants: number;

  availableNames: string[];
  busyNames: string[];
  pendingNames: string[];

  requiredAvailableNames: string[];
  requiredBusyNames: string[];
  requiredPendingNames: string[];

  optionalAvailableNames: string[];
  optionalBusyNames: string[];
  optionalPendingNames: string[];

  totalAvailable: number;
  totalBusy: number;
  totalPending: number;

  requiredAllAvailable: boolean;
  hasPending: boolean;
};

/**
 * 검색 시간 기준 참석자 상태를 계산한다.
 * - pending: 아직 응답하지 않음(가능 인원으로 세지 않는다)
 * - busy: 제출한 busy 블록이 검색 시간과 겹침 (avoid/preferred 는 '참석 가능'으로 본다 — 추천 엔진과 동일)
 * - available: 제출했고 겹치는 busy 블록이 없음
 */
export function lookupAvailabilityAtTime(args: {
  participants: AvailabilityLookupParticipant[];
  blocks: AvailabilityLookupBlock[];
  startAt: string;
  endAt: string;
}): AvailabilityLookupResult {
  const start = Date.parse(args.startAt);
  const end = Date.parse(args.endAt);

  const availableNames: string[] = [];
  const busyNames: string[] = [];
  const pendingNames: string[] = [];

  const requiredAvailableNames: string[] = [];
  const requiredBusyNames: string[] = [];
  const requiredPendingNames: string[] = [];

  const optionalAvailableNames: string[] = [];
  const optionalBusyNames: string[] = [];
  const optionalPendingNames: string[] = [];

  for (const participant of args.participants) {
    const isRequired = participant.attendanceType === "required";
    const isPending = participant.responseStatus !== "submitted";

    if (isPending) {
      pendingNames.push(participant.name);
      (isRequired ? requiredPendingNames : optionalPendingNames).push(participant.name);
      continue;
    }

    const isBusy = args.blocks.some(
      (block) =>
        block.participantId === participant.id &&
        block.status === "busy" &&
        Date.parse(block.startAt) < end &&
        start < Date.parse(block.endAt),
    );

    if (isBusy) {
      busyNames.push(participant.name);
      (isRequired ? requiredBusyNames : optionalBusyNames).push(participant.name);
      continue;
    }

    availableNames.push(participant.name);
    (isRequired ? requiredAvailableNames : optionalAvailableNames).push(participant.name);
  }

  return {
    date: args.startAt.slice(0, 10),
    startAt: args.startAt,
    endAt: args.endAt,

    totalParticipants: args.participants.length,

    availableNames,
    busyNames,
    pendingNames,

    requiredAvailableNames,
    requiredBusyNames,
    requiredPendingNames,

    optionalAvailableNames,
    optionalBusyNames,
    optionalPendingNames,

    totalAvailable: availableNames.length,
    totalBusy: busyNames.length,
    totalPending: pendingNames.length,

    requiredAllAvailable: requiredBusyNames.length === 0 && requiredPendingNames.length === 0,

    hasPending: pendingNames.length > 0,
  };
}
