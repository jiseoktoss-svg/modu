"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { TDSButton } from "@/components/ui/TDSButton";
import { MobileStickyAction } from "@/components/layout/MobileStickyAction";
import { describeDateStr } from "@/lib/time";
import { clearMeetingCreateDraft } from "@/components/meeting/meetingCreateDraft";
import { cn } from "@/lib/cn";
import type { Meeting, Participant } from "@/lib/types";

interface MeetingCreatedPanelProps {
  meeting: Meeting;
  participants: Participant[];
}

function formatDate(date: string): string {
  const dateDesc = describeDateStr(date);
  return `${dateDesc.monthDay} ${dateDesc.weekdayKo}요일`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0 && mins > 0) return `${hours}시간 ${mins}분`;
  if (hours > 0) return `${hours}시간`;
  return `${mins}분`;
}

function participantPillClass(attendanceType: Participant["attendanceType"]) {
  return cn(
    "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 sm:gap-1.5 sm:px-3 sm:py-2",
    attendanceType === "required" ? "bg-brand-50/80" : "bg-slate-50",
  );
}

function participantTypeClass(attendanceType: Participant["attendanceType"]) {
  return cn(
    "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold sm:px-2 sm:text-[11px]",
    attendanceType === "required"
      ? "bg-brand-500 text-white shadow-sm shadow-brand-500/20"
      : "bg-slate-100 text-slate-500",
  );
}

// 성공 버스트 점이 중심에서 퍼져 나가는 6방향(시계 방향).
const COMPLETION_SPARKS = [
  { tx: 30, ty: 0 },
  { tx: 15, ty: 26 },
  { tx: -15, ty: 26 },
  { tx: -30, ty: 0 },
  { tx: -15, ty: -26 },
  { tx: 15, ty: -26 },
];

function CompletionLottie() {
  return (
    <div
      aria-hidden="true"
      className="completion-lottie mx-auto flex h-[72px] w-[72px] items-center justify-center sm:h-20 sm:w-20"
    >
      <svg viewBox="0 0 96 96" className="h-full w-full">
        <defs>
          <radialGradient id="completion-disc-fill" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#f0f7ff" />
            <stop offset="100%" stopColor="#dcecff" />
          </radialGradient>
        </defs>

        {/* 퍼지며 사라지는 헤일로 링 */}
        <circle
          className="completion-halo"
          cx="48"
          cy="48"
          r="34"
          fill="none"
          stroke="#3182f6"
          strokeWidth="3"
        />

        {/* 스프링으로 등장하는 배지(원판 + 외곽선 + 체크) */}
        <g className="completion-badge">
          <circle cx="48" cy="48" r="34" fill="url(#completion-disc-fill)" />
          <circle cx="48" cy="48" r="34" fill="none" stroke="#3182f6" strokeWidth="5" />
          <path
            className="completion-lottie-check"
            d="M32 49.5 43.2 60.5 65 36.5"
            fill="none"
            stroke="#3182f6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="7"
          />
        </g>

        {/* 성공 버스트: 중심에서 튀어나가며 사라지는 점들 */}
        <g className="completion-burst" fill="#3182f6">
          {COMPLETION_SPARKS.map((s, i) => (
            <circle
              key={i}
              cx="48"
              cy="48"
              r="2.6"
              style={
                {
                  "--tx": `${s.tx}px`,
                  "--ty": `${s.ty}px`,
                  animationDelay: `${720 + i * 18}ms`,
                } as CSSProperties
              }
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="10"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="m5 12.5 4.5 4.5L19 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function MeetingCreatedPanel({ meeting, participants }: MeetingCreatedPanelProps) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    clearMeetingCreateDraft(window.sessionStorage);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const participantPath = `/m/${meeting.id}`;
  const participantUrl = origin ? `${origin}${participantPath}` : participantPath;

  const details = useMemo(
    () =>
      [
        { label: "회의명", value: meeting.title },
        { label: "안건", value: meeting.agenda },
        { label: "장소", value: meeting.location },
        { label: "회의 마감일", value: formatDate(meeting.dateEnd) },
        { label: "예상 시간", value: formatDuration(meeting.durationMinutes) },
      ].filter((item) => item.value.trim().length > 0),
    [meeting],
  );

  async function copyParticipantUrl() {
    try {
      await navigator.clipboard.writeText(participantUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = participantUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
    }

    setCopied(true);
  }

  return (
    <section className="flex flex-1 flex-col">
      <div
        role="status"
        aria-live="polite"
        className={[
          "fixed left-1/2 top-5 z-50 inline-flex -translate-x-1/2 items-center gap-2 rounded-[16px] bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-[0_8px_20px_rgba(15,23,42,0.12)] transition-all duration-200 ease-out",
          copied
            ? "translate-y-0 opacity-100 blur-0"
            : "pointer-events-none -translate-y-2 opacity-0 blur-sm",
        ].join(" ")}
      >
        <span className="text-brand-500">
          <CheckIcon />
        </span>
        복사 완료
      </div>

      <div className="flex flex-1 flex-col [justify-content:safe_center] py-3 sm:py-6">
        <div className="w-full">
          <div className="shrink-0 text-center">
            <CompletionLottie />
          <h1
            className="relative mt-4 text-2xl font-extrabold tracking-tight text-slate-900 animate-fade-up-blur motion-reduce:animate-none"
            style={{ animationDelay: "120ms" }}
          >
            회의가 만들어졌어요
          </h1>
        </div>

        <div className="mt-4 space-y-2 sm:mt-5 sm:space-y-3">
          <div
            className="relative rounded-[22px] bg-white p-5 shadow-sm border-y border-slate-100 animate-fade-up-blur motion-reduce:animate-none"
            style={{ animationDelay: "260ms" }}
          >
            <dl className="space-y-2.5">
              {details.map((item) => (
                <div key={item.label} className="grid grid-cols-[72px_1fr] gap-2.5 text-left">
                  <dt className="text-sm font-semibold text-slate-400">{item.label}</dt>
                  <dd className="min-w-0 break-keep text-sm font-semibold text-slate-800">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 border-t border-slate-100 pt-4 text-left">
              <h3 className="text-sm font-bold text-slate-400">참석자 명단</h3>
              <ul className="mt-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1 sm:mt-2.5 sm:max-h-80 sm:justify-start sm:gap-2">
                {participants.map((participant) => (
                  <li
                    key={participant.id}
                    className={participantPillClass(participant.attendanceType)}
                  >
                    <span className="max-w-[5.75rem] truncate text-xs font-bold text-slate-800 sm:max-w-[8rem] sm:text-sm">
                      {participant.name}
                    </span>
                    {participant.role && (
                      <span className="hidden max-w-[9rem] truncate text-xs font-medium text-slate-400 sm:inline">
                        {participant.role}
                      </span>
                    )}
                    <span className={participantTypeClass(participant.attendanceType)}>
                      {participant.attendanceType === "required" ? "필수" : "선택"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div
            className="relative rounded-[22px] bg-white p-5 shadow-sm border-y border-slate-100 animate-fade-up-blur motion-reduce:animate-none"
            style={{ animationDelay: "400ms" }}
          >
            <h2 className="text-sm font-bold text-slate-400">참석자 전달 링크</h2>
            <div className="mt-3 flex items-center gap-2 rounded-[16px] bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
              <p className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-700">
                {participantUrl}
              </p>
              <button
                type="button"
                onClick={copyParticipantUrl}
                aria-label="참석자 링크 복사"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      <MobileStickyAction className="mt-4 sm:mt-0">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <TDSButton
            type="button"
            tone="secondary"
            size="xl"
            display="block"
            className="modu-secondary-cta"
            onClick={copyParticipantUrl}
            aria-live="polite"
          >
            {copied ? "복사됨" : "링크 복사"}
          </TDSButton>
          <TDSButton
            as="a"
            href={participantPath}
            target="_blank"
            rel="noopener noreferrer"
            size="xl"
            display="block"
          >
            회의시간 입력하기
          </TDSButton>
        </div>
      </MobileStickyAction>
    </section>
  );
}
