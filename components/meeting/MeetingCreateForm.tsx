"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createMeeting } from "@/app/actions/meetings";
import { Emoji } from "@/components/ui/Emoji";
import { Input, Label } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { TDSButton } from "@/components/ui/TDSButton";
import {
  ParticipantListEditor,
  type ParticipantDraft,
} from "@/components/meeting/ParticipantListEditor";
import type { FormState } from "@/lib/actionTypes";

interface Props {
  defaultDeadlineDate: string;
  minDeadlineDate: string;
  initialMeeting?: {
    id: string;
    adminToken: string;
    title: string;
    agenda: string;
    location: string;
    deadlineDate: string;
    durationMinutes: number;
    participants: ParticipantDraft[];
  };
}

const INITIAL_PARTICIPANTS: ParticipantDraft[] = [];
const LAST_STEP = 5;
const WORKDAY_MINUTES = 9 * 60; // 09:00~18:00 (서버 기본 근무시간과 일치)

// 단계별 하단 입력의 포커스 대상 element id.
const FOCUS_IDS = [
  "title",
  "agenda",
  "location",
  "deadlineDate",
  "durationHours",
  "participantSelect",
];

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatDeadline(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${y}년 ${m}월 ${d}일 ${WEEKDAYS_KO[wd]}요일`;
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
function EditValue({
  fieldLabel,
  onEdit,
  children,
}: {
  fieldLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${fieldLabel} 수정`}
      className="inline rounded text-left align-baseline font-semibold text-brand-600 decoration-brand-400 decoration-2 underline-offset-4 transition-colors hover:text-brand-700 hover:underline focus:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-brand-200"
    >
      {children}
    </button>
  );
}

function SubmitButton({ disabled, isEditing }: { disabled?: boolean; isEditing?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <TDSButton
      type="submit"
      size="xl"
      display="block"
      disabled={pending || disabled}
      loading={pending}
    >
      {pending
        ? isEditing
          ? "수정 저장 중…"
          : "회의 만드는 중…"
        : isEditing
          ? "수정 저장하기"
          : "회의 만들기"}
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
    <div className="grid h-11 w-24 grid-cols-[2rem_2rem_2rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
  defaultDeadlineDate,
  minDeadlineDate,
  initialMeeting,
}: Props) {
  const [state, formAction] = useFormState<FormState, FormData>(createMeeting, {
    error: null,
  });
  const isEditing = Boolean(initialMeeting);
  const initialDurationMinutes = initialMeeting?.durationMinutes ?? 60;
  const initialDurationHours = Math.floor(initialDurationMinutes / 60);
  const initialDurationMinute = initialDurationMinutes % 60;

  const [title, setTitle] = useState(initialMeeting?.title ?? "");
  const [agenda, setAgenda] = useState(initialMeeting?.agenda ?? "");
  const [location, setLocation] = useState(initialMeeting?.location ?? "");
  const [deadlineDate, setDeadlineDate] = useState(
    initialMeeting?.deadlineDate ?? defaultDeadlineDate,
  );
  // 시간/분은 문자열로 보관해 타이핑 중 빈 칸을 허용한다(즉시 0으로 튀지 않게).
  const [durationHours, setDurationHours] = useState(String(initialDurationHours));
  const [durationMinute, setDurationMinute] = useState(String(initialDurationMinute));
  const [participants, setParticipants] = useState<ParticipantDraft[]>(
    initialMeeting?.participants ?? INITIAL_PARTICIPANTS,
  );
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [participantError, setParticipantError] = useState<string | null>(null);

  // step: 하단에 표시 중인 입력 단계. maxStep: 지금까지 도달한 가장 먼 단계.
  const [step, setStep] = useState(isEditing ? LAST_STEP : 0);
  const [maxStep, setMaxStep] = useState(isEditing ? LAST_STEP : 0);

  // 포커스 제어용 ref.
  const skipInitialFocus = useRef(true); // 최초 마운트 자동 포커스(스크롤 점프) 방지
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

  // 단계별 유효성(모두 필수). 서버 검증과 일치시킨다.
  const dateOk = deadlineDate.trim().length > 0 && deadlineDate >= minDeadlineDate;
  const valid = [
    title.trim().length > 0,
    agenda.trim().length > 0,
    location.trim().length > 0,
    dateOk,
    durationOk,
    filledParticipants.length >= 2,
  ];
  const allValid = valid.every(Boolean);

  // 도달한 단계(i<=maxStep)는 항상 절을 노출하고, 값이 비면 dot 애니메이션을 표시한다.
  const clauseVisible = (i: number) => i <= maxStep;
  const deadlineText = formatDeadline(deadlineDate);

  const goTo = (next: number) => {
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
  };
  const handleNext = () => {
    if (step < LAST_STEP && valid[step]) {
      goTo(step + 1);
      // 시간 입력(4) 다음 → 참석자 선택 모달을 바로 연다.
      if (step + 1 === 5) setShowParticipantModal(true);
    }
  };
  const editStep = (i: number, focusId?: string) => {
    focusOverride.current = focusId ?? null;
    setStep(i);
  };
  const openParticipantModal = () => {
    editStep(5);
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

  // 단계가 바뀌면 해당 입력에 포커스(최초 마운트는 건너뜀, 스크롤 점프 방지).
  useEffect(() => {
    if (skipInitialFocus.current) {
      skipInitialFocus.current = false;
      return;
    }
    const id = focusOverride.current ?? FOCUS_IDS[step] ?? "";
    focusOverride.current = null;
    document.getElementById(id)?.focus({ preventScroll: true });
  }, [step]);

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

  const participantNames = filledParticipants.map((p) => p.name).join(", ");

  return (
    <form action={formAction} className="flex flex-1 flex-col">
      {/* 상단: 입력에 따라 완성되는 안내 문장 */}
      <div className="flex-1 pt-8">
        <p className="text-sm font-medium text-slate-400">회의 만들기</p>
        <div
          aria-live="polite"
          className="mt-3 break-keep text-left text-2xl leading-relaxed text-slate-800 sm:text-3xl sm:leading-relaxed"
        >
          <p>
            {clauseVisible(0) && (
              <span className="animate-fade-in motion-reduce:animate-none">
                이번 회의명은{" "}
                {valueSlot(title.trim() === "", "회의명", () => editStep(0), title)}{" "}
                에요.{" "}
              </span>
            )}
            {clauseVisible(1) && (
              <span className="animate-fade-in motion-reduce:animate-none">
                회의 안건은{" "}
                {valueSlot(agenda.trim() === "", "안건", () => editStep(1), agenda)}{" "}
                입니다.{" "}
              </span>
            )}
            {clauseVisible(2) && (
              <span className="animate-fade-in motion-reduce:animate-none">
                회의 장소는{" "}
                {valueSlot(location.trim() === "", "장소", () => editStep(2), location)}{" "}
                이며,{" "}
              </span>
            )}
            {clauseVisible(3) && (
              <span className="animate-fade-in motion-reduce:animate-none">
                {valueSlot(
                  deadlineText === "",
                  "회의 마감 날짜",
                  () => editStep(3),
                  deadlineText,
                )}{" "}
                까지는 회의가 완료되어야 해요.{" "}
              </span>
            )}
            {clauseVisible(4) && (
              <span className="animate-fade-in motion-reduce:animate-none">
                예상 회의 진행 시간은{" "}
                {showDurationHours && (
                  <>
                    {valueSlot(!hoursOk, "회의 길이", () => editStep(4), hoursNum)}{" "}
                    시간{showDurationMin ? " " : ""}
                  </>
                )}
                {showDurationMin && (
                  <>
                    {valueSlot(
                      !minOk,
                      "회의 길이",
                      () => editStep(4, "durationMinutePart"),
                      minNum,
                    )}{" "}
                    분
                  </>
                )}
                입니다.
              </span>
            )}
          </p>
          {clauseVisible(5) && (
            <p className="mt-4 animate-fade-up text-left motion-reduce:animate-none">
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
              입니다.
            </p>
          )}
        </div>
      </div>

      {/* 폼 제출용 hidden 필드(현재 단계와 무관하게 항상 전체 값 전송) */}
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="agenda" value={agenda} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="deadlineDate" value={deadlineDate} />
      <input type="hidden" name="durationHours" value={hoursOk ? hoursNum : 0} />
      <input type="hidden" name="durationMinutePart" value={minOk ? minNum : 0} />
      {initialMeeting && (
        <>
          <input type="hidden" name="meetingId" value={initialMeeting.id} />
          <input type="hidden" name="adminToken" value={initialMeeting.adminToken} />
        </>
      )}
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
      <div className="mt-8 pb-8 pt-5">
        <div key={step} className="animate-fade-up motion-reduce:animate-none">
          {step === 0 && (
            <>
              <Label htmlFor="title" className="text-lg">회의명을 입력해주세요</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={onFieldKeyDown}
                placeholder="예: 주간 제품 회의"
              />
            </>
          )}
          {step === 1 && (
            <>
              <Label htmlFor="agenda" className="text-lg">회의 안건을 입력해주세요</Label>
              <Input
                id="agenda"
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                onKeyDown={onFieldKeyDown}
                placeholder="예: 다음 스프린트 범위와 출시 일정 정리"
              />
            </>
          )}
          {step === 2 && (
            <>
              <Label htmlFor="location" className="text-lg">회의 장소를 입력해주세요</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={onFieldKeyDown}
                placeholder="예: 7층 회의실 A 또는 Zoom"
              />
            </>
          )}
          {step === 3 && (
            <>
              <Label htmlFor="deadlineDate" className="text-lg">이 날 까지는 회의가 진행되어야 해요.</Label>
              <DatePicker
                id="deadlineDate"
                value={deadlineDate}
                onChange={setDeadlineDate}
                min={minDeadlineDate}
              />
            </>
          )}
          {step === 4 && (
            <>
              <Label htmlFor="durationHours" className="text-lg">예상 회의 진행 시간을 입력해주세요</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-start gap-2">
                  <div
                    id="durationHours"
                    tabIndex={-1}
                    className="rounded-2xl bg-slate-50 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                  >
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
                  <div
                    id="durationMinutePart"
                    tabIndex={-1}
                    className="rounded-2xl bg-slate-50 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                  >
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
                    ? "적절한 시간값을 입력해주세요."
                    : durationTotal > WORKDAY_MINUTES
                      ? "회의 길이는 9시간(근무시간) 이내로 입력해 주세요."
                      : "시간은 0 이상, 분은 0~59 사이로 입력해 주세요."}
                </p>
              )}
            </>
          )}
          {step === 5 && filledParticipants.length < 2 && (
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
            <SubmitButton isEditing={isEditing} />
          ) : step === LAST_STEP && filledParticipants.length < 2 ? (
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
      </div>

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
            className="mx-auto flex h-dvh max-h-dvh w-full max-w-2xl flex-col bg-white p-5 shadow-xl focus:outline-none sm:h-[680px] sm:max-h-[calc(100vh-3rem)] sm:rounded-3xl"
          >
            <div className="mb-1 flex shrink-0 items-start justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-900">참석자 선택</h3>
              <button
                type="button"
                aria-label="참석자 선택 닫기"
                onClick={() => setShowParticipantModal(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
              >
                <Emoji symbol="✕" size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ParticipantListEditor participants={participants} onChange={setParticipants} />
            </div>
            <div className="mt-4 shrink-0">
              {participantError && participants.length < 2 && (
                <div
                  role="alert"
                  className="mb-2 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                >
                  <Emoji symbol="⚠️" size={14} />
                  {participantError}
                </div>
              )}
              <div className="flex justify-end">
                <TDSButton
                  type="button"
                  size="lg"
                  onClick={() => {
                    if (participants.length < 2) {
                      setParticipantError("참석자는 최소 2명 이상 선택해 주세요.");
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
        </div>
      )}
    </form>
  );
}
