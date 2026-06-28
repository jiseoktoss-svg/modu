"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createMeeting } from "@/app/actions/meetings";
import { Button } from "@/components/ui/Button";
import { Emoji } from "@/components/ui/Emoji";
import { Input, Label } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  ParticipantListEditor,
  type ParticipantDraft,
} from "@/components/meeting/ParticipantListEditor";
import type { FormState } from "@/lib/actionTypes";

interface Props {
  defaultDeadlineDate: string;
  minDeadlineDate: string;
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
      className="inline rounded font-semibold text-brand-600 decoration-brand-400 decoration-2 underline-offset-4 transition-colors hover:text-brand-700 hover:underline focus:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-brand-200"
    >
      {children}
    </button>
  );
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending || disabled} className="w-full">
      {pending ? "회의 만드는 중…" : "회의 만들기"}
    </Button>
  );
}

export function MeetingCreateForm({ defaultDeadlineDate, minDeadlineDate }: Props) {
  const [state, formAction] = useFormState<FormState, FormData>(createMeeting, {
    error: null,
  });

  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [location, setLocation] = useState("");
  const [deadlineDate, setDeadlineDate] = useState(defaultDeadlineDate);
  // 시간/분은 문자열로 보관해 타이핑 중 빈 칸을 허용한다(즉시 0으로 튀지 않게).
  const [durationHours, setDurationHours] = useState("1");
  const [durationMinute, setDurationMinute] = useState("0");
  const [participants, setParticipants] = useState<ParticipantDraft[]>(
    INITIAL_PARTICIPANTS,
  );
  const [showParticipantModal, setShowParticipantModal] = useState(false);

  // step: 하단에 표시 중인 입력 단계. maxStep: 지금까지 도달한 가장 먼 단계.
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);

  // 포커스 제어용 ref.
  const skipInitialFocus = useRef(true); // 최초 마운트 자동 포커스(스크롤 점프) 방지
  const focusOverride = useRef<string | null>(null); // 특정 입력으로 포커스 강제
  const closeModalBtnRef = useRef<HTMLButtonElement>(null);
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
    if (step < LAST_STEP && valid[step]) goTo(step + 1);
  };
  const editStep = (i: number, focusId?: string) => {
    focusOverride.current = focusId ?? null;
    setStep(i);
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
    closeModalBtnRef.current?.focus();
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
          className="mt-3 break-keep text-2xl leading-relaxed text-slate-800 sm:text-3xl sm:leading-relaxed"
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
            <p className="mt-4 animate-fade-up motion-reduce:animate-none">
              회의 참석자 명단은{" "}
              {valueSlot(
                filledParticipants.length === 0,
                "참석자",
                () => {
                  editStep(5);
                  setShowParticipantModal(true);
                },
                participantNames,
              )}{" "}
              {filledParticipants.length > 0 && <>총 {filledParticipants.length}명{" "}</>}
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
              <div className="grid grid-cols-[1fr_1fr] gap-2">
                <div className="relative">
                  <Input
                    id="durationHours"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    onKeyDown={onFieldKeyDown}
                    className="pr-9"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                    시간
                  </span>
                </div>
                <div className="relative">
                  <Input
                    id="durationMinutePart"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    step={1}
                    value={durationMinute}
                    onChange={(e) => setDurationMinute(e.target.value)}
                    onKeyDown={onFieldKeyDown}
                    className="pr-7"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                    분
                  </span>
                </div>
              </div>
              {!durationOk && (durationHours.trim() !== "" || durationMinute.trim() !== "") && (
                <p className="mt-2 text-xs text-slate-500">
                  {durationTotal > WORKDAY_MINUTES
                    ? "회의 길이는 9시간(근무시간) 이내로 입력해 주세요."
                    : "시간은 0 이상, 분은 0~59 사이로 입력해 주세요."}
                </p>
              )}
            </>
          )}
          {step === 5 && filledParticipants.length < 2 && (
            <>
              <Label htmlFor="participantSelect" className="text-lg">참석자를 선택해주세요</Label>
              <Button
                id="participantSelect"
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => setShowParticipantModal(true)}
              >
                참석자 선택하기
              </Button>
              <p className="mt-2 text-xs text-slate-500">
                참석자는 최소 2명 이상 선택해 주세요.
              </p>
            </>
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
            <SubmitButton />
          ) : step < LAST_STEP ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={handleNext}
              disabled={!valid[step]}
            >
              다음
            </Button>
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
          className="fixed inset-0 z-30 flex items-end bg-slate-900/40 p-0 sm:items-center sm:p-6"
        >
          <div
            ref={modalPanelRef}
            className="mx-auto flex h-[90vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white p-5 shadow-xl sm:h-[680px] sm:rounded-3xl"
          >
            <div className="mb-2 flex shrink-0 items-start justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-900">참석자 선택</h3>
              <button
                ref={closeModalBtnRef}
                type="button"
                onClick={() => setShowParticipantModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="참석자 선택 닫기"
              >
                <Emoji symbol="❌" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ParticipantListEditor participants={participants} onChange={setParticipants} />
            </div>
            <div className="mt-4 flex shrink-0 justify-end">
              <Button type="button" onClick={() => setShowParticipantModal(false)}>
                선택 완료
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
