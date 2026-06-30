// 제품 흐름 데모용 케이스 데이터. docs/cases.md 의 8개 필수 케이스를 화면에 보여주기 위한 더미.
// 실제 입력과 무관하게, 케이스를 고르면 그 케이스에 맞는 후보 순위/캘린더를 보여준다.
// (현재 추천 엔진은 §8 차선후보/우선순위 규칙을 구현하지 않아, 의도한 결과를 손으로 정의한다.)

import { kstWallToIso } from "@/lib/time";
import type { RecommendationGrade } from "@/lib/scheduler";
import type { AttendanceType, AvailabilityStatus, ResponseStatus } from "@/lib/types";

const SLOT_DURATION_MIN = 60; // cases.md: 회의 길이 1시간

// 전제: 참석자 6명 = 필수 4명 + 선택 2명.
export const DEMO_PEOPLE: {
  id: string;
  name: string;
  role: string;
  attendanceType: AttendanceType;
}[] = [
  { id: "demo-p0", name: "김지훈", role: "기획", attendanceType: "required" },
  { id: "demo-p1", name: "이서연", role: "디자인", attendanceType: "required" },
  { id: "demo-p2", name: "박민준", role: "개발", attendanceType: "required" },
  { id: "demo-p3", name: "최수아", role: "마케팅", attendanceType: "required" },
  { id: "demo-p4", name: "정우진", role: "개발", attendanceType: "optional" },
  { id: "demo-p5", name: "한예린", role: "디자인", attendanceType: "optional" },
];

const REQUIRED_TOTAL = DEMO_PEOPLE.filter((p) => p.attendanceType === "required").length; // 4
const OPTIONAL_TOTAL = DEMO_PEOPLE.length - REQUIRED_TOTAL; // 2

type DemoSlot = {
  dateIndex: number;
  startMin: number; // 자정 이후 분 (KST)
  busy: number[]; // 이 시간에 불가능한 사람 인덱스(DEMO_PEOPLE)
  votes?: number; // 투표 케이스에서만 사용
  // 등급/순위는 buildCaseCandidates 가 §8.5 로직으로 도출한다(하드코딩 안 함).
};

export type DemoCase = {
  id: number;
  title: string;
  situation: string;
  judgment: string;
  banner?: { tone: "info" | "caution" | "danger"; text: string };
  submitted: number; // 응답 완료 인원 (총 6명 중)
  pendingNames: string[];
  votingOpen: boolean;
  slots: DemoSlot[];
};

const H = (h: number) => h * 60;

export const DEMO_CASES: DemoCase[] = [
  {
    id: 1,
    title: "모두 되는 시간이 있음",
    situation: "필수인원 4명과 선택인원 2명이 전부 가능한 시간이 있어요.",
    judgment: "모두가 되는 시간이라 1순위로 추천해요.",
    submitted: 6,
    pendingNames: [],
    votingOpen: true,
    slots: [
      { dateIndex: 1, startMin: H(14), busy: [] },
      { dateIndex: 2, startMin: H(10), busy: [4] },
      { dateIndex: 0, startMin: H(15), busy: [5] },
      { dateIndex: 3, startMin: H(11), busy: [4, 5] },
    ],
  },
  {
    id: 2,
    title: "필수인원만 다 됨 (선택인원 일부 빠짐)",
    situation: "필수인원 4명은 다 되지만, 어느 시간이든 선택인원이 1~2명 빠져요.",
    judgment: "선택인원이 빠져도 필수인원이 다 되면 정상 후보로 우선해요.",
    submitted: 6,
    pendingNames: [],
    votingOpen: true,
    slots: [
      { dateIndex: 1, startMin: H(14), busy: [4] },
      { dateIndex: 2, startMin: H(10), busy: [5] },
      { dateIndex: 0, startMin: H(16), busy: [4, 5] },
    ],
  },
  {
    id: 3,
    title: "필수 우선 vs 선택 우선 충돌",
    situation:
      "필수인원이 다 되지만 선택인원이 빠지는 시간과, 선택인원은 다 되지만 필수인원 1명이 빠지는 시간이 같이 있어요.",
    judgment: "필수인원이 다 되는 시간을 위에 둬요. 선택인원이 더 많이 돼도 필수인원이 빠지면 뒤로 밀려요.",
    submitted: 6,
    pendingNames: [],
    votingOpen: true,
    slots: [
      // 필수 전원 가능, 선택 둘 다 빠짐 → 그래도 필수 빠지는 후보들보다 위
      { dateIndex: 1, startMin: H(14), busy: [4, 5] },
      // 선택 전원 가능, 필수 1명(김지훈) 빠짐
      { dateIndex: 2, startMin: H(10), busy: [0] },
      // 필수 2명(이서연·박민준) 빠짐 → 더 아래
      { dateIndex: 0, startMin: H(15), busy: [1, 2] },
    ],
  },
  {
    id: 4,
    title: "필수인원이 다 되는 시간이 없음",
    situation: "어느 시간을 골라도 필수인원 중 최소 1명은 빠져요.",
    judgment: "필수인원이 가장 적게 빠지는 시간을 차선으로 보여줘요.",
    banner: {
      tone: "caution",
      text: "필수인원이 전부 되는 시간이 없어 차선 후보를 보여드려요.",
    },
    submitted: 6,
    pendingNames: [],
    votingOpen: true,
    slots: [
      { dateIndex: 1, startMin: H(14), busy: [3] },
      { dateIndex: 2, startMin: H(10), busy: [1] },
      { dateIndex: 0, startMin: H(15), busy: [2, 4] },
    ],
  },
  {
    id: 5,
    title: "차선 후보가 비슷비슷함",
    situation: "여러 시간이 모두 필수인원 1명씩만 빠져서 우열을 가리기 애매해요.",
    judgment: "선택인원이 더 많이 되는 시간을 먼저, 그래도 같으면 더 이른 시간을 먼저 보여줘요.",
    banner: {
      tone: "caution",
      text: "모두 필수인원 1명이 빠지는 후보예요. 선택인원 수와 빠른 시간 순으로 정렬했어요.",
    },
    submitted: 6,
    pendingNames: [],
    votingOpen: true,
    slots: [
      { dateIndex: 0, startMin: H(10), busy: [0] },
      { dateIndex: 1, startMin: H(14), busy: [1] },
      { dateIndex: 2, startMin: H(11), busy: [2, 5] },
    ],
  },
  {
    id: 6,
    title: "필수인원이 2명 이상 빠지는 시간뿐",
    situation: "어느 시간을 골라도 필수인원이 2명 넘게 빠져요.",
    judgment: "차선으로 넘기기엔 무리예요. 회의 자체를 다시 잡으라고 강하게 알려줘요.",
    banner: {
      tone: "danger",
      text: "어느 시간이든 필수인원이 2명 이상 빠져요. 지금 일정으로는 회의가 어려우니 날짜를 다시 잡는 걸 권해요.",
    },
    submitted: 6,
    pendingNames: [],
    votingOpen: false,
    slots: [
      { dateIndex: 1, startMin: H(14), busy: [0, 1] },
      { dateIndex: 2, startMin: H(10), busy: [2, 3] },
      { dateIndex: 0, startMin: H(15), busy: [0, 1, 4] },
    ],
  },
  {
    id: 7,
    title: "아직 응답 안 한 사람 있음",
    situation: "참석자 6명 중 2명이 아직 불가능 시간을 입력하지 않았어요. (필수인원 1명 포함)",
    judgment: "전원이 응답하기 전엔 투표를 열지 않아요. 특히 필수인원이 안 했으면 후보를 확정할 수 없어요.",
    banner: {
      tone: "caution",
      text: "아직 응답하지 않은 사람이 있어 잠정 순위만 보여줘요. 모두 응답하면 투표가 열려요.",
    },
    submitted: 4,
    pendingNames: ["최수아", "한예린"],
    votingOpen: false,
    slots: [
      { dateIndex: 2, startMin: H(10), busy: [] },
      { dateIndex: 1, startMin: H(14), busy: [4] },
      { dateIndex: 0, startMin: H(15), busy: [1] },
    ],
  },
  {
    id: 8,
    title: "투표가 동점",
    situation: "필수인원 투표 결과가 2표씩 똑같이 나왔어요.",
    judgment: "투표가 동점이면, 더 많은 인원이 참석할 수 있는 회의 시간이 후보권 상위에 노출돼요.",
    banner: {
      tone: "info",
      text: "투표가 2표로 동점이에요. 더 많은 인원이 참석할 수 있는 후보가 상위에 노출돼요.",
    },
    submitted: 6,
    pendingNames: [],
    votingOpen: true,
    slots: [
      // 6명 전원 가능(2표) vs 5명(2표) 동점 → 더 많은 인원이 참석 가능한 위 후보가 상위
      { dateIndex: 1, startMin: H(14), busy: [], votes: 2 },
      { dateIndex: 2, startMin: H(10), busy: [4], votes: 2 },
      { dateIndex: 0, startMin: H(15), busy: [4, 5], votes: 0 },
    ],
  },
];

export type CaseCandidate = {
  startAt: string;
  endAt: string;
  grade: RecommendationGrade;
  requiredAvail: number;
  requiredTotal: number;
  optionalAvail: number;
  optionalTotal: number;
  absentRequired: string[];
  votes: number | null;
  reason: string;
};

function slotTimes(dates: string[], slot: DemoSlot) {
  const di = Math.max(0, Math.min(slot.dateIndex, dates.length - 1));
  const date = dates[di] ?? dates[0];
  return {
    startAt: kstWallToIso(date, slot.startMin),
    endAt: kstWallToIso(date, slot.startMin + SLOT_DURATION_MIN),
  };
}

export function buildCaseCandidates(c: DemoCase, dates: string[]): CaseCandidate[] {
  if (dates.length === 0) return [];
  const pending = new Set(c.pendingNames);

  // 각 슬롯을 §8.5 지표로 환산한다(busy=불가, pending=미응답).
  const enriched = c.slots.map((slot) => {
    const di = Math.max(0, Math.min(slot.dateIndex, dates.length - 1));
    const requiredBusyNames: string[] = [];
    const requiredPendingNames: string[] = [];
    let optionalBusy = 0;
    let optionalPending = 0;
    DEMO_PEOPLE.forEach((p, idx) => {
      const isBusy = slot.busy.includes(idx);
      const isPending = pending.has(p.name);
      if (p.attendanceType === "required") {
        if (isBusy) requiredBusyNames.push(p.name);
        else if (isPending) requiredPendingNames.push(p.name);
      } else if (isBusy) {
        optionalBusy += 1;
      } else if (isPending) {
        optionalPending += 1;
      }
    });
    return {
      slot,
      di,
      ...slotTimes(dates, slot),
      requiredBusyNames,
      requiredPendingNames,
      optionalMissing: optionalBusy + optionalPending,
      requiredAvail: REQUIRED_TOTAL - requiredBusyNames.length - requiredPendingNames.length,
      optionalAvail: OPTIONAL_TOTAL - optionalBusy - optionalPending,
      requiredAllAvailable: requiredBusyNames.length === 0 && requiredPendingNames.length === 0,
      totalBusy: requiredBusyNames.length + optionalBusy,
    };
  });

  // §8.5 정렬: 1)필수 전원 가능 2)필수 더 많이 3)선택 더 많이 4)충돌 적음 5)이른 시간
  enriched.sort((a, b) => {
    if (a.requiredAllAvailable !== b.requiredAllAvailable) return a.requiredAllAvailable ? -1 : 1;
    if (a.requiredAvail !== b.requiredAvail) return b.requiredAvail - a.requiredAvail;
    if (a.optionalAvail !== b.optionalAvail) return b.optionalAvail - a.optionalAvail;
    if (a.totalBusy !== b.totalBusy) return a.totalBusy - b.totalBusy;
    if (a.di !== b.di) return a.di - b.di;
    return a.slot.startMin - b.slot.startMin;
  });

  // '가장 추천(best)'은 필수·선택 모두 가능한 1순위 1개에만.
  let bestAssigned = false;
  return enriched.map((e) => {
    let grade: RecommendationGrade;
    if (!e.requiredAllAvailable) {
      grade = "caution";
    } else if (e.optionalMissing === 0 && !bestAssigned) {
      grade = "best";
      bestAssigned = true;
    } else if (e.optionalMissing <= 1) {
      grade = "recommended";
    } else {
      grade = "conditional";
    }

    const reqParts: string[] = [];
    if (e.requiredBusyNames.length > 0) reqParts.push(`${e.requiredBusyNames.join(", ")} 빠짐`);
    if (e.requiredPendingNames.length > 0)
      reqParts.push(`${e.requiredPendingNames.join(", ")} 미응답`);
    const requiredText =
      reqParts.length === 0
        ? `필수인원 ${REQUIRED_TOTAL}명 모두 가능`
        : `필수인원 ${reqParts.join(", ")}`;
    const optionalText =
      e.optionalAvail === OPTIONAL_TOTAL
        ? `선택인원 ${OPTIONAL_TOTAL}명 모두 가능`
        : `선택인원 ${e.optionalAvail}/${OPTIONAL_TOTAL}명 가능`;

    return {
      startAt: e.startAt,
      endAt: e.endAt,
      grade,
      requiredAvail: e.requiredAvail,
      requiredTotal: REQUIRED_TOTAL,
      optionalAvail: e.optionalAvail,
      optionalTotal: OPTIONAL_TOTAL,
      absentRequired: e.requiredBusyNames,
      votes: c.votingOpen && e.slot.votes != null ? e.slot.votes : null,
      reason: `${requiredText} · ${optionalText}`,
    };
  });
}

export type CaseSnapshot = {
  participants: {
    id: string;
    name: string;
    role: string;
    attendanceType: AttendanceType;
    responseStatus: ResponseStatus;
  }[];
  blocks: { participantId: string; startAt: string; endAt: string; status: AvailabilityStatus }[];
};

export function buildCaseSnapshot(c: DemoCase, dates: string[]): CaseSnapshot {
  const blocks: CaseSnapshot["blocks"] = [];
  const seen = new Set<string>();
  if (dates.length > 0) {
    for (const slot of c.slots) {
      const { startAt, endAt } = slotTimes(dates, slot);
      for (const i of slot.busy) {
        const p = DEMO_PEOPLE[i];
        if (!p) continue;
        const key = `${p.id}|${startAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push({ participantId: p.id, startAt, endAt, status: "busy" });
      }
    }
  }
  const pending = new Set(c.pendingNames);
  const participants = DEMO_PEOPLE.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    attendanceType: p.attendanceType,
    responseStatus: (pending.has(p.name) ? "pending" : "submitted") as ResponseStatus,
  }));
  return { participants, blocks };
}
