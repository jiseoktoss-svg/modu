"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { createMeeting } from "@/app/actions/meetings";
import { MobileHeaderTitle } from "@/components/layout/MobileHeaderTitle";
import { MobileStickyAction } from "@/components/layout/MobileStickyAction";
import { Emoji } from "@/components/ui/Emoji";
import { Input, Label } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { TDSButton } from "@/components/ui/TDSButton";
import { CharFillSentence } from "@/components/ui/CharFillSentence";
import { charFillTiming, type CharFillSegment } from "@/lib/charFill";
import { cn } from "@/lib/cn";
import { hasBatchim } from "@/lib/korean";
import { useScrollLock } from "@/lib/useScrollLock";
import { addDaysToDateStr } from "@/lib/time";
import {
  MEETING_CREATE_DRAFT_LAST_STEP,
  readMeetingCreateDraft,
  writeMeetingCreateDraft,
} from "@/components/meeting/meetingCreateDraft";
import {
  ParticipantListEditor,
  type ParticipantDraft,
} from "@/components/meeting/ParticipantListEditor";
import type { FormState } from "@/lib/actionTypes";
import {
  MAX_MEETING_AGENDA_LENGTH,
  MAX_MEETING_LOCATION_LENGTH,
  MAX_MEETING_PARTICIPANTS,
  MAX_MEETING_TITLE_LENGTH,
  MIN_MEETING_PARTICIPANTS,
} from "@/lib/meetingLimits";

interface Props {
  minDeadlineDate: string;
}

const INITIAL_PARTICIPANTS: ParticipantDraft[] = [];
const LAST_STEP = MEETING_CREATE_DRAFT_LAST_STEP;
const WORKDAY_MINUTES = 9 * 60; // 09:00~18:00 (서버 기본 근무시간과 일치)
// 글자 채움(fill): 확인 문장이 글자 하나씩 읽는 순서대로 좌→우 잉크처럼 칠해진다.
// 타이밍·슬롯 규칙은 lib/charFill.ts 공용(회의 안내 문장과 동일한 리듬).
const CONFIRM_CTA_DURATION_MS = 1000;

// 단계별 하단 입력의 포커스 대상 element id.
const FOCUS_IDS = [
  "title",
  "agenda",
  "location",
  "durationHours",
  "deadlineDate",
  "responseDeadlineDate",
  "participantSelect",
];

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatDeadline(dateStr: string, withYear = true): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${withYear ? `${y}년 ` : ""}${m}월 ${d}일 ${WEEKDAYS_KO[wd]}요일`;
}

// 빈 값 자리표시: 회색 dot 3개 파도타기 애니메이션.
function DotWave() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1.5 leading-none">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-slate-400 animate-dot-wave motion-reduce:animate-none"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

// 상단 문장에서 클릭하면 해당 항목으로 돌아가 수정할 수 있는 값(파란 강조, 밑줄은 호버 시에만).
// shine: 회의 안내(intro) 필드값과 동일한 shine 스윕. 글자 채움 mask 와 같은 요소에 겹칠 수
// 없어서(둘 다 animation·배경을 쓰므로) 확인 화면에서는 채움이 끝난 뒤에만 켠다.
function EditValue({
  fieldLabel,
  onEdit,
  shine = false,
  children,
}: {
  fieldLabel: string;
  onEdit: () => void;
  shine?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${fieldLabel} 수정`}
      className={cn(
        "inline whitespace-normal break-all rounded text-left align-baseline font-bold text-brand-600 decoration-brand-400 decoration-2 underline-offset-4 transition-colors hover:text-brand-700 hover:underline focus:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-brand-200",
        shine && "modu-value-shine",
      )}
    >
      {children}
    </button>
  );
}

function LimitedFieldLabel({
  htmlFor,
  invalid,
  children,
}: {
  htmlFor: string;
  invalid: boolean;
  children: ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} id={`${htmlFor}-limit`} role={invalid ? "alert" : undefined} className="text-lg">
      {invalid ? (
        // 경고는 확실히 빨갛게 — Label 기본색(text-slate-700)과의 클래스 충돌을 피하려고
        // 부모 override 대신 자식 span 에 색을 준다(cn 은 tailwind-merge 가 아니다).
        <span className="inline-flex items-start gap-1.5 text-red-600">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-red-600 text-[11px] font-extrabold leading-none text-red-600"
          >
            !
          </span>
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </Label>
  );
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <TDSButton
      type="submit"
      size="xl"
      display="block"
      disabled={pending || disabled}
      loading={pending}
    >
      {pending ? "회의 만드는 중…" : "회의 만들기"}
    </TDSButton>
  );
}

interface NumberStepperProps {
  ariaLabel: string;
  inputValue: string;
  max: number;
  min: number;
  minusLabel: string;
  onInputChange: (e: ReactChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  onNumberChange: (next: number) => void;
  plusLabel: string;
  step?: number;
  value: number;
}

function NumberStepper({
  ariaLabel,
  inputValue,
  max,
  min,
  minusLabel,
  onInputChange,
  onKeyDown,
  onNumberChange,
  plusLabel,
  step = 1,
  value,
}: NumberStepperProps) {
  const safeValue = Number.isFinite(value) ? value : min;
  const canDecrease = safeValue > min;
  const canIncrease = safeValue < max;

  return (
    <div className="grid h-11 w-[6.75rem] grid-cols-[2rem_2.75rem_2rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        aria-label={minusLabel}
        disabled={!canDecrease}
        onClick={() => onNumberChange(Math.max(min, safeValue - step))}
        className="flex items-center justify-center text-lg font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-200"
      >
        -
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel}
        value={inputValue}
        onChange={onInputChange}
        onFocus={(e) => e.target.select()}
        onKeyDown={onKeyDown}
        className="min-w-0 border-x border-slate-100 bg-white px-1 text-center text-lg font-extrabold tabular-nums text-slate-900 outline-none focus:bg-brand-50/40"
      />
      <button
        type="button"
        aria-label={plusLabel}
        disabled={!canIncrease}
        onClick={() => onNumberChange(Math.min(max, safeValue + step))}
        className="flex items-center justify-center text-lg font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-200"
      >
        +
      </button>
    </div>
  );
}

export function MeetingCreateForm({
  minDeadlineDate,
}: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(createMeeting, {
    error: null,
  });
  const initialDurationMinutes = 60;
  const initialDurationHours = Math.floor(initialDurationMinutes / 60);
  const initialDurationMinute = initialDurationMinutes % 60;

  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [location, setLocation] = useState("");
  // 신규 생성 시에는 날짜를 비워 두어 사용자가 직접 선택하게 한다(자동 선택 방지).
  const [deadlineDate, setDeadlineDate] = useState("");
  const [responseDeadlineDate, setResponseDeadlineDate] = useState("");
  const [responseDeadlineTime, setResponseDeadlineTime] = useState("18:00");
  // 시간/분은 문자열로 보관해 타이핑 중 빈 칸을 허용한다(즉시 0으로 튀지 않게).
  const [durationHours, setDurationHours] = useState(String(initialDurationHours));
  const [durationMinute, setDurationMinute] = useState(String(initialDurationMinute));
  const [participants, setParticipants] = useState<ParticipantDraft[]>(INITIAL_PARTICIPANTS);
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  // step: 하단에 표시 중인 입력 단계. maxStep: 지금까지 도달한 가장 먼 단계.
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [confirming, setConfirming] = useState(false); // 회의 확인 화면 표시 여부
  const [confirmCtaReady, setConfirmCtaReady] = useState(false); // 7번 문구 등장 후 회의 만들기 노출
  // 확인 화면 글자 채움은 세션 중 1회만 — 키워드 수정 후 다시 돌아오면 즉시 완료 상태로 그린다.
  const [confirmPlayed, setConfirmPlayed] = useState(false);
  // 포커스 제어용 ref.
  const skipInitialFocus = useRef(true); // 최초 마운트 자동 포커스(스크롤 점프) 방지
  const skipNextAutoFocus = useRef(false); // 모바일 '다음' 이동 시 자동 포커스(키보드 팝업·스크롤) 방지
  const focusOverride = useRef<string | null>(null); // 특정 입력으로 포커스 강제
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const backdropDownRef = useRef(false); // backdrop 에서 mousedown 시작했는지

  const filledParticipants = participants.filter((p) => p.name.trim().length > 0);

  // 시간/분 안전 파싱 + 서버 검증과 동일한 경계.
  const hoursNum = Number(durationHours);
  const minNum = Number(durationMinute);
  const hoursOk =
    durationHours.trim() !== "" && Number.isInteger(hoursNum) && hoursNum >= 0;
  const minOk =
    durationMinute.trim() !== "" &&
    Number.isInteger(minNum) &&
    minNum >= 0 &&
    minNum <= 59;
  const durationTotal = (hoursOk ? hoursNum : 0) * 60 + (minOk ? minNum : 0);
  const durationOk =
    hoursOk && minOk && durationTotal > 0 && durationTotal <= WORKDAY_MINUTES;
  // 상단 문장: 값이 0인 시간/분은 숨긴다. (둘 다 0이면 시간만 표시해 문장이 비지 않게)
  const showDurationMin = !minOk || minNum > 0;
  const showDurationHours = !hoursOk || hoursNum > 0 || !showDurationMin;

  // 회의 마감일은 최소 오늘+2일, 응답 마감일은 회의 마감일보다 최소 2일 앞서야 한다.
  const minMeetingDeadlineDate = addDaysToDateStr(minDeadlineDate, 2);
  const responseDeadlineMax = deadlineDate ? addDaysToDateStr(deadlineDate, -2) : "";
  // 단계별 유효성(모두 필수). 서버 검증과 일치시킨다.
  const dateOk = deadlineDate.trim().length > 0 && deadlineDate >= minMeetingDeadlineDate;
  // 응답 마감일: 오늘 이후 + 회의 마감일 이전(같은 날 허용) + 시간 형식. (분 단위는 쓰지 않음 → 항상 :00)
  const rdHour = responseDeadlineTime.split(":")[0] || "18";
  const rdHourOptions = Array.from({ length: 24 }, (_, h) => {
    const hh = String(h).padStart(2, "0");
    return { value: hh, label: `${hh}시` };
  });
  const responseDateOk =
    responseDeadlineDate.trim().length > 0 &&
    responseDeadlineDate >= minDeadlineDate &&
    responseDeadlineMax !== "" &&
    responseDeadlineDate <= responseDeadlineMax;
  const responseTimeOk = /^\d{2}:\d{2}$/.test(responseDeadlineTime);
  const responseDeadlineOk = responseDateOk && responseTimeOk;
  const titleTooLong = title.length > MAX_MEETING_TITLE_LENGTH;
  const agendaTooLong = agenda.length > MAX_MEETING_AGENDA_LENGTH;
  const locationTooLong = location.length > MAX_MEETING_LOCATION_LENGTH;
  // 상단 문장 표시는 글자 제한까지만 — 제한을 넘긴 입력이 문장에 계속 흘러나오지 않게 한다.
  const titleDisplay = title.slice(0, MAX_MEETING_TITLE_LENGTH);
  const agendaDisplay = agenda.slice(0, MAX_MEETING_AGENDA_LENGTH);
  const locationDisplay = location.slice(0, MAX_MEETING_LOCATION_LENGTH);
  const valid = [
    title.trim().length > 0 && !titleTooLong,
    agenda.trim().length > 0 && !agendaTooLong,
    location.trim().length > 0 && !locationTooLong,
    durationOk,
    dateOk,
    responseDeadlineOk,
    filledParticipants.length >= MIN_MEETING_PARTICIPANTS &&
      filledParticipants.length <= MAX_MEETING_PARTICIPANTS,
  ];
  const allValid = valid.every(Boolean);

  // 도달한 단계(i<=maxStep)는 항상 절을 노출하고, 값이 비면 dot 애니메이션을 표시한다.
  const clauseVisible = (i: number) => i <= maxStep;
  const deadlineText = formatDeadline(deadlineDate);
  const responseDeadlineText = responseDeadlineDate
    ? `${formatDeadline(responseDeadlineDate)} ${responseDeadlineTime}`
    : "";
  // 회의 확인 화면의 날짜값은 년도 없이 표시한다("7월 5일 일요일").
  const confirmDeadlineText = formatDeadline(deadlineDate, false);
  const confirmResponseDeadlineText = responseDeadlineDate
    ? `${formatDeadline(responseDeadlineDate, false)} ${responseDeadlineTime}`
    : "";

  const goTo = (next: number) => {
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
  };
  const handleNext = () => {
    if (step < LAST_STEP && valid[step]) {
      // 모바일에서는 '다음'으로 넘어가도 다음 입력에 자동 포커스하지 않는다(직접 터치해야 활성화).
      skipNextAutoFocus.current = window.matchMedia("(max-width: 639px)").matches;
      goTo(step + 1);
    }
  };
  const editStep = (i: number, focusId?: string) => {
    focusOverride.current = focusId ?? null;
    setStep(i);
  };
  // 뒤로가기로 벗어나는 단계의 입력값을 초기 상태로 되돌린다(뒤로가기 = 해당 입력 취소).
  const clearStepValue = (s: number) => {
    switch (s) {
      case 0:
        setTitle("");
        break;
      case 1:
        setAgenda("");
        break;
      case 2:
        setLocation("");
        break;
      case 3:
        setDurationHours(String(initialDurationHours));
        setDurationMinute(String(initialDurationMinute));
        break;
      case 4:
        setDeadlineDate("");
        break;
      case 5:
        setResponseDeadlineDate("");
        setResponseDeadlineTime("18:00");
        break;
      case 6:
        setParticipants([]);
        break;
    }
  };
  // 모바일 헤더 뒤로가기: 이전 입력 단계로 한 단계씩 되돌아간다(자동 포커스 없이).
  const handleStepBack = () => {
    skipNextAutoFocus.current = window.matchMedia("(max-width: 639px)").matches;
    clearStepValue(step);
    setStep((s) => Math.max(0, s - 1));
  };
  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  };
  // 회의 마감일을 앞당겨 응답 마감일(회의 마감일 2일 전)을 넘기면 자동으로 맞춰 조정한다.
  const handleDeadlineChange = (next: string) => {
    setDeadlineDate(next);
    const cap = next ? addDaysToDateStr(next, -2) : "";
    if (responseDeadlineDate && cap && responseDeadlineDate > cap) {
      setResponseDeadlineDate(cap);
      showToast("회의 마감일에 맞춰 응답 마감일을 조정했어요.");
    }
  };
  // 응답 마감일은 회의 마감일 2일 전까지만 → 넘기면 자동 지정 + 경고 토스트.
  const handleResponseDeadlineDateChange = (next: string) => {
    const cap = deadlineDate ? addDaysToDateStr(deadlineDate, -2) : "";
    if (cap && next > cap) {
      setResponseDeadlineDate(cap);
      showToast("응답 마감일은 회의 마감일 2일 전까지만 정할 수 있어 맞췄어요.");
      return;
    }
    setResponseDeadlineDate(next);
  };
  const openParticipantModal = () => {
    editStep(LAST_STEP);
    setShowParticipantModal(true);
  };

  // 값이 있으면 파란 EditValue, 없으면 dot 자리표시(클릭 시 해당 항목으로 이동).
  const valueSlot = (
    empty: boolean,
    fieldLabel: string,
    onEdit: () => void,
    value: ReactNode,
  ) =>
    empty ? (
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${fieldLabel} 입력`}
        className="mx-1.5 inline-flex items-center rounded align-middle leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        <DotWave />
      </button>
    ) : (
      <EditValue fieldLabel={fieldLabel} onEdit={onEdit}>
        {value}
      </EditValue>
    );

  // Enter: 암묵적 제출을 막고 '다음'으로만 동작한다(제출은 버튼 클릭으로만).
  const onFieldKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNext();
    }
  };

  const handleDurationHoursChange = (nextHours: number) => {
    setDurationHours(String(nextHours));
    if (nextHours >= WORKDAY_MINUTES / 60) {
      setDurationMinute("0");
    }
  };

  const normalizeDurationMinute = (minute: number) => {
    const maxMinute = hoursNum >= WORKDAY_MINUTES / 60 ? 0 : 55;
    return Math.min(maxMinute, Math.max(0, Math.round(minute / 5) * 5));
  };

  const handleDurationMinuteChange = (nextMinute: number) => {
    const currentMinute = minOk ? minNum : 0;
    const directionAdjustedMinute =
      nextMinute > currentMinute
        ? currentMinute + 5
        : nextMinute < currentMinute
          ? currentMinute - 5
          : nextMinute;
    setDurationMinute(String(normalizeDurationMinute(directionAdjustedMinute)));
  };

  // 스피너 가운데 숫자 위 투명 input: 탭 후 직접 타이핑. 숫자만, 최대 2자리, 빈 칸 허용.
  const handleDurationHoursInput = (e: ReactChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
    if (digits === "") {
      setDurationHours("");
      return;
    }
    handleDurationHoursChange(Number(digits));
  };

  const handleDurationMinuteInput = (e: ReactChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
    if (digits === "") {
      setDurationMinute("");
      return;
    }
    setDurationMinute(String(normalizeDurationMinute(Number(digits))));
  };

  const participantNames = filledParticipants.map((p) => p.name).join(", ");

  // 회의 생성 전 임시 저장: 새로고침해도 작성 중인 확인 화면과 입력값을 복원한다.
  useEffect(() => {
    const draft = readMeetingCreateDraft(window.sessionStorage);
    if (draft) {
      skipNextAutoFocus.current = true;
      setTitle(draft.title);
      setAgenda(draft.agenda);
      setLocation(draft.location);
      setDeadlineDate(draft.deadlineDate);
      setResponseDeadlineDate(draft.responseDeadlineDate);
      setResponseDeadlineTime(draft.responseDeadlineTime);
      setDurationHours(draft.durationHours);
      setDurationMinute(draft.durationMinute);
      setParticipants(draft.participants);
      setStep(draft.step);
      setMaxStep(draft.maxStep);
      setConfirming(draft.confirming);
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    writeMeetingCreateDraft(window.sessionStorage, {
      title,
      agenda,
      location,
      deadlineDate,
      responseDeadlineDate,
      responseDeadlineTime,
      durationHours,
      durationMinute,
      participants,
      step,
      maxStep,
      confirming,
    });
  }, [
    agenda,
    confirming,
    deadlineDate,
    draftReady,
    durationHours,
    durationMinute,
    location,
    maxStep,
    participants,
    responseDeadlineDate,
    responseDeadlineTime,
    step,
    title,
  ]);

  // 회의 확인 화면: 키워드(값)를 누르면 확인 화면을 닫고 해당 입력 단계로 돌아간다.
  const editFromConfirm = (target: number) => {
    setConfirming(false);
    editStep(target);
  };
  const editParticipantsFromConfirm = () => {
    setConfirming(false);
    openParticipantModal();
  };
  // 회의 확인 화면 문장. 값은 폼 상단 빌더와 동일하게 구성하고, 클릭하면 수정할 수 있다.
  const durationText = [
    showDurationHours ? `${hoursNum}시간` : "",
    showDurationMin ? `${minNum}분` : "",
  ]
    .filter(Boolean)
    .join(" ");
  // 수정 가능한 값 조각: 글자 span 들을 EditValue 로 감싼다(shine 은 채움 완료 후 점등).
  const confirmValue = (
    text: string,
    fieldLabel: string,
    onEdit: () => void,
  ): CharFillSegment => ({
    text,
    wrap: (chars, shine) => (
      <EditValue fieldLabel={fieldLabel} onEdit={onEdit} shine={shine}>
        {chars}
      </EditValue>
    ),
  });
  // 글자 하나 단위로 칠하기 위해 문장을 [일반 텍스트 | 수정 가능한 값] 조각으로 둔다.
  const confirmClauses: CharFillSegment[][] = [
    [
      "이번 회의명은 ",
      confirmValue(title.trim(), "회의명", () => editFromConfirm(0)),
      hasBatchim(title) ? " 이에요." : " 예요.",
    ],
    [
      "회의 안건은 ",
      confirmValue(agenda.trim(), "안건", () => editFromConfirm(1)),
      hasBatchim(agenda) ? " 이에요." : " 예요.",
    ],
    [
      "회의 장소는 ",
      confirmValue(location.trim(), "장소", () => editFromConfirm(2)),
      " 이고,",
    ],
    [
      "예상 회의 진행 시간은 ",
      confirmValue(durationText, "회의 길이", () => editFromConfirm(3)),
      " 이에요.",
    ],
    [
      confirmValue(confirmDeadlineText, "회의 마감 날짜", () => editFromConfirm(4)),
      " 까지는 회의를 마쳐야 해요.",
    ],
    [
      "참여자는 ",
      confirmValue(confirmResponseDeadlineText, "응답 마감", () => editFromConfirm(5)),
      " 까지 응답해주세요.",
    ],
    [
      "회의 참석자 명단은 ",
      confirmValue(participantNames, "참석자", editParticipantsFromConfirm),
      ` 총 ${filledParticipants.length}명이에요.`,
    ],
  ];

  // 채움 종료 시각 → 안내 문구·CTA 등장 지연(글자 수 비례).
  const { fillEndMs: confirmFillEndMs } = charFillTiming(confirmClauses);
  const confirmHelpDelayMs = Math.max(0, confirmFillEndMs - 200); // 마지막 글자가 거의 채워진 뒤
  const confirmCtaDelayMs = confirmHelpDelayMs + 600;

  // 단계가 바뀌면 해당 입력에 포커스(최초 마운트·모바일 '다음' 이동은 건너뜀).
  useEffect(() => {
    if (skipInitialFocus.current) {
      skipInitialFocus.current = false;
      return;
    }
    if (skipNextAutoFocus.current) {
      skipNextAutoFocus.current = false;
      return;
    }
    const id = focusOverride.current ?? FOCUS_IDS[step] ?? "";
    focusOverride.current = null;
    document.getElementById(id)?.focus({ preventScroll: true });
  }, [step]);

  // 참석자 모달: 배경 스크롤 잠금.
  useScrollLock(showParticipantModal);

  // 회의 확인 화면: 마지막(7번) 문구가 등장한 뒤에 '회의 만들기' 버튼을 노출한다.
  // 이미 한 번 재생했다면(수정 후 재진입) 기다리지 않고 바로 노출한다.
  useEffect(() => {
    if (!confirming) {
      setConfirmCtaReady(false);
      return;
    }
    const timer = window.setTimeout(
      () => setConfirmCtaReady(true),
      confirmPlayed ? 0 : confirmCtaDelayMs,
    );
    return () => window.clearTimeout(timer);
  }, [confirming, confirmCtaDelayMs, confirmPlayed]);

  // 회의 확인 화면: 글자 채움이 끝나기 전에는 문장 속 키워드의 호버·클릭을 막는다.
  const [confirmFillDone, setConfirmFillDone] = useState(false);
  useEffect(() => {
    if (!confirming) {
      setConfirmFillDone(false);
      return;
    }
    const timer = window.setTimeout(
      () => setConfirmFillDone(true),
      confirmPlayed ? 0 : confirmFillEndMs,
    );
    return () => window.clearTimeout(timer);
  }, [confirming, confirmFillEndMs, confirmPlayed]);

  // 입력 ↔ 확인 화면 전환 시 스크롤을 맨 위로(이전 화면 스크롤 위치가 이어지는 문제).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [confirming]);

  // 참석자 모달 접근성: Esc 닫기 + 열림 시 포커스 이동 + 닫힘 시 트리거로 복원.
  useEffect(() => {
    if (!showParticipantModal) return;
    setParticipantError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowParticipantModal(false);
        return;
      }
      // focus trap: 모달 안에서 Tab 순환.
      if (e.key === "Tab" && modalPanelRef.current) {
        const nodes = modalPanelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    modalPanelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.getElementById("participantSelect")?.focus({ preventScroll: true });
    };
  }, [showParticipantModal]);

  return (
    <form
      action={formAction}
      className="flex flex-1 flex-col"
    >
      {/* 경고 토스트(응답 마감일 자동 보정 등) */}
      <div
        aria-live="assertive"
        className={cn(
          "pointer-events-none fixed inset-x-0 top-4 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-200",
          toast ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        )}
      >
        <Emoji symbol="⚠️" size={16} />
        <span className="break-keep">{toast}</span>
      </div>

      {/* 상단: 입력에 따라 완성되는 안내 문장 */}
      {!confirming && (
      <div className="flex-1 pt-4 sm:pt-8">
        <MobileHeaderTitle
          title="회의 만들기"
          onBack={step > 0 ? handleStepBack : undefined}
        />
        <p className="hidden text-sm font-medium text-slate-400 sm:block">회의 만들기</p>
        <div
          aria-live="polite"
          className="break-keep text-left text-2xl leading-relaxed text-slate-800 sm:mt-3 sm:text-3xl sm:leading-relaxed"
        >
          <p>
            {clauseVisible(0) && (
              <span className="relative animate-fade-up-blur motion-reduce:animate-none">
                이번 회의명은{" "}
                {valueSlot(title.trim() === "", "회의명", () => editStep(0), titleDisplay)}{" "}
                {hasBatchim(titleDisplay) ? "이에요." : "예요."}{" "}
              </span>
            )}
            {clauseVisible(1) && (
              <span className="relative animate-fade-up-blur motion-reduce:animate-none">
                회의 안건은{" "}
                {valueSlot(agenda.trim() === "", "안건", () => editStep(1), agendaDisplay)}{" "}
                {hasBatchim(agendaDisplay) ? "이에요." : "예요."}{" "}
              </span>
            )}
            {clauseVisible(2) && (
              <span className="relative animate-fade-up-blur motion-reduce:animate-none">
                회의 장소는{" "}
                {valueSlot(location.trim() === "", "장소", () => editStep(2), locationDisplay)}{" "}
                이고,{" "}
              </span>
            )}
            {clauseVisible(3) && (
              <span className="relative animate-fade-up-blur motion-reduce:animate-none">
                예상 회의 진행 시간은{" "}
                {showDurationHours && (
                  <>
                    {valueSlot(!hoursOk, "회의 길이", () => editStep(3), hoursNum)}{" "}
                    시간{showDurationMin ? " " : ""}
                  </>
                )}
                {showDurationMin && (
                  <>
                    {valueSlot(
                      !minOk,
                      "회의 길이",
                      () => editStep(3, "durationMinutePart"),
                      minNum,
                    )}{" "}
                    분
                  </>
                )}
                이에요.{" "}
              </span>
            )}
            {clauseVisible(4) && (
              <span className="relative animate-fade-up-blur motion-reduce:animate-none">
                {valueSlot(
                  deadlineText === "",
                  "회의 마감 날짜",
                  () => editStep(4),
                  deadlineText,
                )}{" "}
                까지는 회의가 완료되어야 해요.{" "}
              </span>
            )}
            {clauseVisible(5) && (
              <span className="relative animate-fade-up-blur motion-reduce:animate-none">
                참여자는{" "}
                {valueSlot(
                  responseDeadlineText === "",
                  "응답 마감",
                  () => editStep(5),
                  responseDeadlineText,
                )}{" "}
                까지 응답해주세요.{" "}
              </span>
            )}
          </p>
          {clauseVisible(6) && (
            <p className="mt-4 relative animate-fade-up-blur text-left motion-reduce:animate-none">
              회의 참석자 명단은{" "}
              {valueSlot(
                filledParticipants.length === 0,
                "참석자",
                openParticipantModal,
                participantNames,
              )}{" "}
              {filledParticipants.length > 0 && (
                <>
                  <EditValue fieldLabel="참석자" onEdit={openParticipantModal}>
                    총 {filledParticipants.length}명
                  </EditValue>{" "}
                </>
              )}
              이에요.
            </p>
          )}
        </div>
      </div>
      )}

      {/* 폼 제출용 hidden 필드(현재 단계와 무관하게 항상 전체 값 전송) */}
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="agenda" value={agenda} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="deadlineDate" value={deadlineDate} />
      <input type="hidden" name="responseDeadlineDate" value={responseDeadlineDate} />
      <input type="hidden" name="responseDeadlineTime" value={responseDeadlineTime} />
      <input type="hidden" name="durationHours" value={hoursOk ? hoursNum : 0} />
      <input type="hidden" name="durationMinutePart" value={minOk ? minNum : 0} />
      <input
        type="hidden"
        name="participants"
        value={JSON.stringify(
          filledParticipants.map((p) => ({
            name: p.name.trim(),
            role: p.role.trim(),
            attendanceType: p.attendanceType,
          })),
        )}
      />

      {/* 하단: 현재 단계 입력 + 액션 버튼 */}
      {!confirming && (
      <MobileStickyAction className="mt-6 sm:mt-8">
        <div key={step}>
          {step === 0 && (
            <>
              <LimitedFieldLabel htmlFor="title" invalid={titleTooLong}>
                {titleTooLong ? (
                  <>
                    회의명은 최대 {MAX_MEETING_TITLE_LENGTH}글자까지 입력할 수 있어요.
                  </>
                ) : (
                  "회의명을 입력해주세요"
                )}
              </LimitedFieldLabel>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={onFieldKeyDown}
                aria-invalid={titleTooLong || undefined}
                aria-describedby={titleTooLong ? "title-limit" : undefined}
                className={cn(
                  titleTooLong &&
                    "!border-red-600 focus:!border-2 focus:!border-red-600 focus:!ring-0",
                )}
                placeholder="예: 주간 제품 회의"
              />
            </>
          )}
          {step === 1 && (
            <>
              <LimitedFieldLabel htmlFor="agenda" invalid={agendaTooLong}>
                {agendaTooLong ? (
                  <>
                    회의 안건은 최대 {MAX_MEETING_AGENDA_LENGTH}글자까지 입력할 수 있어요.
                  </>
                ) : (
                  "회의 안건을 입력해주세요"
                )}
              </LimitedFieldLabel>
              <Input
                id="agenda"
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                onKeyDown={onFieldKeyDown}
                aria-invalid={agendaTooLong || undefined}
                aria-describedby={agendaTooLong ? "agenda-limit" : undefined}
                className={cn(
                  agendaTooLong &&
                    "!border-red-600 focus:!border-2 focus:!border-red-600 focus:!ring-0",
                )}
                placeholder="예: 다음 스프린트 범위와 출시 일정 정리"
              />
            </>
          )}
          {step === 2 && (
            <>
              <LimitedFieldLabel htmlFor="location" invalid={locationTooLong}>
                {locationTooLong ? (
                  <>
                    회의 장소는 최대 {MAX_MEETING_LOCATION_LENGTH}글자까지 입력할 수 있어요.
                  </>
                ) : (
                  "회의 장소를 입력해주세요"
                )}
              </LimitedFieldLabel>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={onFieldKeyDown}
                aria-invalid={locationTooLong || undefined}
                aria-describedby={locationTooLong ? "location-limit" : undefined}
                className={cn(
                  locationTooLong &&
                    "!border-red-600 focus:!border-2 focus:!border-red-600 focus:!ring-0",
                )}
                placeholder="예: 7층 회의실 A 또는 Zoom"
              />
            </>
          )}
          {step === 4 && (
            <>
              <Label htmlFor="deadlineDate" className="text-lg">이 날까지는 회의를 마쳐야 해요.</Label>
              <DatePicker
                id="deadlineDate"
                value={deadlineDate}
                onChange={handleDeadlineChange}
                min={minMeetingDeadlineDate}
                minReason="회의는 오늘부터 이틀 뒤부터 정할 수 있어요"
                placeholder="날짜를 선택해주세요"
              />
            </>
          )}
          {step === 5 && (
            <>
              <Label htmlFor="responseDeadlineDate" className="text-lg">
                참여자들이 언제까지 응답하면 될까요?
              </Label>
              <DatePicker
                id="responseDeadlineDate"
                value={responseDeadlineDate}
                onChange={handleResponseDeadlineDateChange}
                min={minDeadlineDate}
                max={responseDeadlineMax || undefined}
                minReason="오늘 이후부터 정할 수 있어요"
                maxReason="회의 마감일 2일 전까지만 정할 수 있어요"
                placeholder="날짜를 선택해주세요"
              />
              <div className="mt-2">
                <Select
                  variant="menu"
                  aria-label="응답 마감 시각"
                  value={rdHour}
                  options={rdHourOptions}
                  onValueChange={(v) => setResponseDeadlineTime(`${v}:00`)}
                />
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <Label htmlFor="durationHours" className="text-lg">예상 회의 진행 시간을 입력해주세요</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-start gap-2">
                  <div id="durationHours" tabIndex={-1}>
                    <NumberStepper
                      ariaLabel="회의 진행 시간(시간) 직접 입력"
                      value={hoursOk ? hoursNum : 0}
                      inputValue={durationHours}
                      min={0}
                      max={WORKDAY_MINUTES / 60}
                      minusLabel="회의 시간 줄이기"
                      plusLabel="회의 시간 늘리기"
                      onNumberChange={handleDurationHoursChange}
                      onInputChange={handleDurationHoursInput}
                      onKeyDown={onFieldKeyDown}
                    />
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-700">시간</span>
                </div>
                <div className="flex items-center justify-start gap-2">
                  <div id="durationMinutePart" tabIndex={-1}>
                    <NumberStepper
                      ariaLabel="회의 진행 시간(분) 직접 입력"
                      value={minOk ? minNum : 0}
                      inputValue={durationMinute}
                      min={0}
                      max={hoursNum >= WORKDAY_MINUTES / 60 ? 0 : 55}
                      step={5}
                      minusLabel="회의 분 줄이기"
                      plusLabel="회의 분 늘리기"
                      onNumberChange={handleDurationMinuteChange}
                      onInputChange={handleDurationMinuteInput}
                      onKeyDown={onFieldKeyDown}
                    />
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-700">분</span>
                </div>
              </div>
              {!durationOk && (
                <p className="mt-2 text-xs text-slate-500">
                  {durationTotal === 0
                    ? "시간을 올바르게 입력해 주세요."
                    : durationTotal > WORKDAY_MINUTES
                      ? "회의 길이는 9시간(근무시간) 이내로 입력해 주세요."
                      : "시간은 0 이상, 분은 0~59 사이로 입력해 주세요."}
                </p>
              )}
            </>
          )}
          {step === LAST_STEP &&
            (filledParticipants.length < MIN_MEETING_PARTICIPANTS ||
              filledParticipants.length > MAX_MEETING_PARTICIPANTS) && (
            <Label htmlFor="participantSelect" className="text-lg">
              본인 포함 참석자를 선택해주세요
            </Label>
          )}
        </div>

        {state.error && (
          <div
            role="alert"
            className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            <Emoji symbol="⚠️" size={16} />
            {state.error}
          </div>
        )}

        <div className="mt-4">
          {step === LAST_STEP && allValid && !showParticipantModal ? (
            <TDSButton
              type="button"
              size="xl"
              display="block"
              onClick={() => setConfirming(true)}
            >
              다음
            </TDSButton>
          ) : step === LAST_STEP &&
            (filledParticipants.length < MIN_MEETING_PARTICIPANTS ||
              filledParticipants.length > MAX_MEETING_PARTICIPANTS) ? (
            <TDSButton
              id="participantSelect"
              type="button"
              size="xl"
              display="block"
              onClick={() => setShowParticipantModal(true)}
            >
              참석자 선택하기
            </TDSButton>
          ) : step < LAST_STEP ? (
            <TDSButton
              type="button"
              size="xl"
              display="block"
              onClick={handleNext}
              disabled={!valid[step]}
            >
              다음
            </TDSButton>
          ) : null}
        </div>
      </MobileStickyAction>
      )}

      {confirming && (
        <>
          <div className="flex-1 pt-4 sm:pt-8">
            {/* 확인 화면 뒤로가기: 마지막 입력 단계(참석자)로 복귀 */}
            <MobileHeaderTitle title="회의 확인" onBack={() => setConfirming(false)} />
            <p className="hidden text-sm font-medium text-slate-400 sm:block">회의 확인</p>
            {/* 글자가 읽는 순서대로 좌→우 잉크처럼 칠해지는 등장(공용 CharFillSentence).
                채움이 끝나기 전에는 키워드 호버·클릭을 막는다.
                retainCharSpans: 문장이 길어(7절) 완료 순간 DOM 교체 번쩍임이 보여서
                이 화면만 span 유지 방식을 쓴다(회의 안내·입력 확인은 종전 그대로). */}
            <div className={cn(!confirmFillDone && "pointer-events-none")}>
              <CharFillSentence
                className="text-left sm:mt-3"
                retainCharSpans
                instant={confirmPlayed}
                onFillDone={() => setConfirmPlayed(true)}
                paragraphs={[
                  { clauses: confirmClauses.slice(0, 6) },
                  { clauses: [confirmClauses[6]], className: "mt-4" },
                ]}
              />
            </div>
            <p
              className="relative mt-4 animate-fade-up-blur text-sm text-slate-400 motion-reduce:animate-none"
              style={{
                animationDelay: `${confirmPlayed ? 0 : confirmHelpDelayMs}ms`,
                animationDuration: "1s",
              }}
            >
              수정하려면 키워드를 눌러 해당화면으로 이동하세요.
            </p>
          </div>

          <MobileStickyAction className="mt-6 sm:mt-8">
            {state.error && (
              <div
                role="alert"
                className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              >
                <Emoji symbol="⚠️" size={16} />
                {state.error}
              </div>
            )}
            {confirmCtaReady && (
              <div
                className="animate-fade-up-blur motion-reduce:animate-none"
                style={{ animationDuration: `${CONFIRM_CTA_DURATION_MS}ms` }}
              >
                <SubmitButton />
              </div>
            )}
          </MobileStickyAction>
        </>
      )}

      {showParticipantModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="참석자 선택"
          onMouseDown={(e) => {
            backdropDownRef.current = e.target === e.currentTarget;
          }}
          onMouseUp={(e) => {
            if (backdropDownRef.current && e.target === e.currentTarget) {
              setShowParticipantModal(false);
            }
            backdropDownRef.current = false;
          }}
          className="fixed inset-0 z-30 flex items-stretch bg-slate-900/40 p-0 sm:items-center sm:p-6"
        >
          <div
            ref={modalPanelRef}
            tabIndex={-1}
            className="mx-auto flex h-dvh max-h-dvh w-full max-w-2xl flex-col overflow-hidden bg-white p-4 shadow-xl focus:outline-none sm:h-[744px] sm:max-h-[calc(100vh-3rem)] sm:rounded-3xl sm:p-5"
          >
            <div className="mb-0.5 flex shrink-0 items-start justify-between gap-3 sm:mb-1 sm:gap-4">
              <h3 className="text-base font-bold text-slate-900 sm:text-lg">참석자 선택</h3>
              <button
                type="button"
                aria-label="참석자 선택 닫기"
                onClick={() => setShowParticipantModal(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
              >
                <Emoji symbol="✕" size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ParticipantListEditor participants={participants} onChange={setParticipants} />
            </div>
            <div className="mt-3 shrink-0 sm:mt-4">
              {participantError &&
                (participants.length < MIN_MEETING_PARTICIPANTS ||
                  participants.length > MAX_MEETING_PARTICIPANTS) && (
                <div
                  role="alert"
                  className="mb-2 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                >
                  <Emoji symbol="⚠️" size={14} />
                  {participantError}
                </div>
              )}
              <TDSButton
                type="button"
                size="xl"
                display="block"
                onClick={() => {
                  if (participants.length < MIN_MEETING_PARTICIPANTS) {
                    setParticipantError(
                      `참석자를 ${MIN_MEETING_PARTICIPANTS}명 이상 선택해 주세요.`,
                    );
                    return;
                  }
                  if (participants.length > MAX_MEETING_PARTICIPANTS) {
                    setParticipantError(
                      `참석자는 최대 ${MAX_MEETING_PARTICIPANTS}명까지 선택할 수 있어요.`,
                    );
                    return;
                  }
                  setParticipantError(null);
                  setShowParticipantModal(false);
                }}
              >
                선택 완료
              </TDSButton>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
