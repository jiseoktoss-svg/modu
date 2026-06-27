import type { AttendanceType, AvailabilityStatus, ResponseStatus } from "@/lib/types";
import { nextWeekMonToFri } from "@/lib/time";

// 샘플 회의 "계획"을 만든다 (토큰/DB 비의존 순수 함수).
// 실제 삽입과 토큰 생성은 createSampleMeeting 서버 액션이 담당한다.
// dayOffset 0 = 다음 주 월요일 ... 4 = 금요일.

export interface SampleBlock {
  dayOffset: number;
  startHm: string;
  endHm: string;
  status: AvailabilityStatus;
  note?: string;
}

export interface SampleParticipant {
  name: string;
  role: string;
  attendanceType: AttendanceType;
  responseStatus: ResponseStatus;
  blocks: SampleBlock[];
}

export interface SampleMeetingPlan {
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
  participants: SampleParticipant[];
}

export function buildSampleMeetingPlan(now: Date): SampleMeetingPlan {
  const { dateStart, dateEnd } = nextWeekMonToFri(now);

  // 필수 4명 + 선택 2명. 미응답 1명, 외근 메모 2명, 점심 직후 회피 2명 포함.
  const participants: SampleParticipant[] = [
    {
      name: "김지훈",
      role: "PM",
      attendanceType: "required",
      responseStatus: "submitted",
      blocks: [
        { dayOffset: 0, startHm: "09:00", endHm: "11:00", status: "busy", note: "오전 외근" },
        { dayOffset: 2, startHm: "14:00", endHm: "16:00", status: "preferred" },
      ],
    },
    {
      name: "이서연",
      role: "디자이너",
      attendanceType: "required",
      responseStatus: "submitted",
      blocks: [
        { dayOffset: 0, startHm: "13:00", endHm: "14:00", status: "avoid", note: "점심 직후는 집중이 어려워요" },
        { dayOffset: 3, startHm: "15:00", endHm: "18:00", status: "busy" },
        { dayOffset: 2, startHm: "14:00", endHm: "15:00", status: "preferred" },
      ],
    },
    {
      name: "박민준",
      role: "백엔드",
      attendanceType: "required",
      responseStatus: "submitted",
      blocks: [
        { dayOffset: 1, startHm: "09:00", endHm: "18:00", status: "busy", note: "외근" },
        { dayOffset: 2, startHm: "10:00", endHm: "11:00", status: "preferred" },
      ],
    },
    {
      name: "최유나",
      role: "프론트엔드",
      attendanceType: "required",
      responseStatus: "submitted",
      blocks: [
        { dayOffset: 0, startHm: "14:00", endHm: "15:00", status: "busy" },
        { dayOffset: 4, startHm: "16:00", endHm: "18:00", status: "avoid" },
        { dayOffset: 2, startHm: "14:00", endHm: "15:00", status: "preferred" },
      ],
    },
    {
      name: "정현우",
      role: "마케팅",
      attendanceType: "optional",
      responseStatus: "submitted",
      blocks: [
        { dayOffset: 2, startHm: "09:00", endHm: "12:00", status: "busy" },
        { dayOffset: 3, startHm: "13:00", endHm: "14:00", status: "avoid" },
      ],
    },
    {
      name: "한가람",
      role: "QA",
      attendanceType: "optional",
      responseStatus: "pending",
      blocks: [],
    },
  ];

  return {
    title: "주간 제품 회의",
    agenda: "이번 주 제품 진행 상황과 다음 릴리스 범위를 합의합니다.",
    location: "온라인 Zoom",
    durationMinutes: 60,
    dateStart,
    dateEnd,
    workdayStart: "09:00",
    workdayEnd: "18:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    participants,
  };
}
