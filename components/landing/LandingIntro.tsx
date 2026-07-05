"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { StartMeetingButton } from "@/components/meeting/StartMeetingButton";
import { cn } from "@/lib/cn";

// 랜딩 인트로 모션(Claude Design 시안 이식).
// 장면 1(응답 타이핑) → 장면 2(응답 수렴·분석 필) → 장면 3(달력 선별) → modu 워드마크,
// 재생이 끝나야 하단 고정 CTA(회의 만들기)가 페이드인된다.
// 같은 세션 재방문·저감 모션·건너뛰기는 애니메이션 없이 마지막 장면 + CTA를 바로 보여준다.

// 장면 4 워드마크(15.15s + 0.55s)까지 끝난 뒤 CTA 페이드인.
const INTRO_DURATION_MS = 16_100;

type Phase = "pending" | "playing" | "done";

const KEYFRAMES = `
@keyframes mi-scene-out { to { opacity: 0; visibility: hidden; } }
@keyframes mi-scene-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes mi-card-in { from { opacity: 0; transform: scale(0.94) translateY(12px); } }
@keyframes mi-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mi-pop { 0% { opacity: 0; transform: scale(0); } 60% { opacity: 1; transform: scale(1.14); } 100% { opacity: 1; transform: scale(1); } }
@keyframes mi-char-type { 0% { max-width: 0; opacity: 0; } 60% { opacity: 0; } 100% { max-width: 1.2em; opacity: 1; } }
@keyframes mi-floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes mi-caret-blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }
@keyframes mi-caret-hide { to { opacity: 0; } }
@keyframes mi-click-ring { 0% { opacity: 0; transform: scale(0.3); } 12% { opacity: 0.65; transform: scale(0.42); } 100% { opacity: 0; transform: scale(1.9); } }
@keyframes mi-press { 0% { transform: scale(1); filter: brightness(1); } 40% { transform: scale(0.955); filter: brightness(0.9); } 100% { transform: scale(1); filter: brightness(1); } }
/* linear 타이밍 + 이동 거리에 비례한 구간 배분으로 커서 속도를 일정하게 유지한다 */
@keyframes mi-cursor-submit {
  0%   { opacity: 0; transform: translate(298px, 262px) scale(1); }
  10%  { opacity: 1; }
  17%  { transform: translate(268px, 232px) scale(1); }
  68%  { transform: translate(166px, 164px) scale(1); }
  72%  { transform: translate(166px, 164px) scale(0.82); }
  76%  { transform: translate(166px, 164px) scale(1); }
  87%  { transform: translate(182px, 182px) scale(1); }
  88%  { opacity: 1; }
  100% { opacity: 0; transform: translate(200px, 208px) scale(1); }
}
@keyframes mi-converge { to { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.25); } }
@keyframes mi-pill-in { 0% { opacity: 0; transform: scale(0.55); } 65% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: scale(1); } }
@keyframes mi-pill-bump { 0% { transform: scale(1); } 45% { transform: scale(1.1); } 100% { transform: scale(1); } }
@keyframes mi-border-flow { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
@keyframes mi-glow-pulse { 0%, 100% { opacity: 0.45; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.12); } }
/* 장면 3: 스캔 광선이 달력을 훑고 → 탈락 칸이 빨갛게 물들고 → 우수수 낙하 */
@keyframes mi-scan { from { transform: translateX(-130%); } to { transform: translateX(320%); } }
@keyframes mi-cell-mark { to { background: #fecaca; } }
@keyframes mi-cell-fall-l { to { opacity: 0; transform: translateY(150px) rotate(-18deg); } }
@keyframes mi-cell-fall-r { to { opacity: 0; transform: translateY(150px) rotate(22deg); } }
/* 장면 4: 후보 리스트가 위로 빠르게 날아가고, 워드마크가 팡 하고 등장한다 */
@keyframes mi-list-up { to { opacity: 0; transform: translateY(-110px) scale(0.94); } }
@keyframes mi-pop-in {
  0%   { opacity: 0; transform: scale(0.45); }
  70%  { opacity: 1; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes mi-burst { 0% { opacity: 0.55; transform: scale(0.2); } 100% { opacity: 0; transform: scale(1.7); } }
`;

// ── 장면 데이터 ─────────────────────────────

// 장면 1: 타이핑 문장(빨간 강조 = 불가 값). 공백도 한 슬롯을 차지한다(시차 0.07s).
const TYPED: Array<{ ch?: string; red?: boolean }> = [
  { ch: "저" }, { ch: "는" }, {},
  { ch: "7", red: true }, { ch: "월", red: true }, {},
  { ch: "1", red: true }, { ch: "0", red: true }, { ch: "일", red: true },
  { ch: "에" }, { ch: "는" }, {},
  { ch: "회" }, { ch: "의" }, { ch: "가" }, {},
  { ch: "불", red: true }, { ch: "가", red: true }, { ch: "능", red: true },
  { ch: "해" }, { ch: "요" },
];

// 장면 2: 참석자 뱃지 4개(모서리) + 중앙으로 수렴하는 불가 칩 4개.
const BADGES = [
  { name: "지수", required: true, pos: { left: -8, top: 60 }, pop: 4.8, float: "mi-floaty 3.2s ease-in-out 0.2s infinite" },
  { name: "민준", required: true, pos: { right: -8, top: 60 }, pop: 4.95, float: "mi-floaty 3.6s ease-in-out 0.8s infinite" },
  { name: "지석", required: true, pos: { left: -8, top: 218 }, pop: 5.4, float: "mi-floaty 3.3s ease-in-out 0.6s infinite" },
  { name: "하늘", required: true, pos: { right: -8, top: 218 }, pop: 5.55, float: "mi-floaty 3.7s ease-in-out 1.3s infinite" },
  { name: "서연", required: false, pos: { left: -8, top: 384 }, pop: 5.1, float: "mi-floaty 3s ease-in-out 0.4s infinite" },
  { name: "도윤", required: false, pos: { right: -8, top: 384 }, pop: 5.25, float: "mi-floaty 3.4s ease-in-out 1.1s infinite" },
] as const;

const CHIPS = [
  { label: "7/8 종일", pos: { left: 8, top: 100 }, dx: 127, dy: 152, pop: 5.5, converge: 5.95 },
  { label: "7/9 오전", pos: { right: 8, top: 100 }, dx: -125, dy: 152, pop: 5.75, converge: 6.2 },
  { label: "7/11", pos: { left: 8, top: 352 }, dx: 134, dy: -100, pop: 6, converge: 6.45 },
  { label: "7/14 오후", pos: { right: 8, top: 352 }, dx: -120, dy: -100, pop: 6.25, converge: 6.7 },
] as const;

// 장면 3: 탈락하는 날짜(값은 등장 순서 인덱스). 스캔이 지나간 뒤 빨갛게 물들고, 순서대로 낙하한다.
const CELL_FALL: Record<number, number> = {
  3: 0, 6: 1, 8: 2, 9: 3, 10: 4, 11: 5, 13: 6, 14: 7, 21: 8, 24: 9, 28: 10,
};
const MARK_BASE = 10.8; // 빨간 칸 물들기 시작
const MARK_STEP = 0.03;
const FALL_BASE = 11.3; // 낙하 시작
const FALL_STEP = 0.07;

// 추천 후보 리스트 — 달력 다음 장면(장면 4)에서 새로 노출. 2026년 7월 기준 요일(주말·탈락일 제외).
const CANDIDATE_DATES = [
  "7월 1일 수요일",
  "7월 2일 목요일",
  "7월 7일 화요일",
  "7월 15일 수요일",
  "7월 16일 목요일",
  "7월 17일 금요일",
  "7월 20일 월요일",
  "7월 22일 수요일",
  "7월 23일 목요일",
  "7월 27일 월요일",
  "7월 29일 수요일",
  "7월 30일 목요일",
] as const;

// 후보 행마다 조금씩 다른 파란 그라디언트를 돌려 쓴다.
const CANDIDATE_GRADIENTS = [
  "linear-gradient(105deg, #e8f3ff 0%, #ffffff 70%)",
  "linear-gradient(105deg, #dceeff 0%, #f4faff 70%)",
  "linear-gradient(105deg, #e8f3ff 0%, #f0f7ff 70%)",
] as const;

// mi-converge 가 읽는 수렴 목표 좌표(CSS 커스텀 프로퍼티).
type ChipStyle = CSSProperties & { "--dx": string; "--dy": string };

// 날짜 숫자·테두리 없이 칸만 보여주는 달력 셀.
const cellStyle: CSSProperties = {
  height: 28,
  borderRadius: 8,
  background: "#f1f5f9",
};

const attendeeBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  borderRadius: 999,
  background: "#f1f5f9",
  padding: "3px 9px 3px 3px",
  fontSize: 12,
  fontWeight: 600,
  color: "#334155",
  boxShadow: "0 4px 10px rgba(15, 23, 42, 0.1)",
};

function AttendeeTag({ required, name }: { required: boolean; name: string }) {
  return (
    <span style={attendeeBadgeStyle}>
      <span
        style={{
          borderRadius: 999,
          padding: "2px 6px",
          fontSize: 9,
          fontWeight: 700,
          background: required ? "linear-gradient(120deg, #2272eb 0%, #4593fc 100%)" : "#cbd5e1",
          color: required ? "#ffffff" : "#475569",
        }}
      >
        {required ? "필수" : "선택"}
      </span>
      {name}
    </span>
  );
}

// 장면 하단 캡션 — 장면 1(카드 안 문구)에서 이어지는 절. flyAt 이 있으면 그 시점에 위로 날아간다.
function SceneCaption({ text, delay, flyAt }: { text: string; delay: number; flyAt?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 24,
        textAlign: "center",
        fontSize: 19,
        fontWeight: 800,
        color: "#334155",
        animation:
          `mi-fade-up 0.55s ease-out ${delay}s both` +
          (flyAt != null
            ? `, mi-list-up 0.35s cubic-bezier(0.5, 0, 1, 0.5) ${flyAt}s forwards`
            : ""),
        opacity: 0,
      }}
    >
      {text}
    </div>
  );
}

function Wordmark() {
  return (
    <>
      <div
        style={{
          fontSize: 46,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          background: "linear-gradient(120deg, #194aa0 0%, #2272eb 45%, #64a8ff 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        modu
      </div>
      <div style={{ marginTop: 10, fontSize: 17, fontWeight: 700, color: "#334155" }}>
        가장 나은 시간을 찾아드려요
      </div>
    </>
  );
}

// 시안 그대로의 애니메이션 아트보드라 내부는 Tailwind 대신 인라인 스타일을 유지한다
// (px 단위 좌표·딜레이가 서로 맞물려 있어 클래스 변환 시 어긋나기 쉬움).
function MotionScenes() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* ════ 장면 1 · 타이핑 클로즈업 → 응답하기 (0 ~ 4.6s) ════ */}
      <div style={{ position: "absolute", inset: 0, animation: "mi-scene-out 0.45s ease 4.2s both" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 340, transform: "translateX(-50%)" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 130,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 20,
              padding: 18,
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
              animation: "mi-card-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 999,
                  background: "#f1f5f9",
                  padding: "3px 9px 3px 3px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                <span
                  style={{
                    borderRadius: 999,
                    padding: "2px 7px",
                    fontSize: 10,
                    fontWeight: 700,
                    background: "linear-gradient(120deg, #2272eb 0%, #4593fc 100%)",
                    color: "#ffffff",
                    boxShadow: "0 1px 2px rgba(49, 130, 246, 0.2)",
                  }}
                >
                  필수
                </span>
                김하늘
              </span>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>님의 응답</div>
            </div>

            {/* 질문(입력창 위 안내) */}
            <div
              style={{
                marginTop: 12,
                fontSize: 16,
                fontWeight: 700,
                color: "#334155",
                animation: "mi-fade-up 0.5s ease-out 0.4s both",
              }}
            >
              어려운 시간만 알려주면 돼요
            </div>

            {/* 타이핑 입력창 — 글자가 폭을 갖고 늘어나 커서(캐럿)가 입력 위치를 따라간다 */}
            <div
              style={{
                marginTop: 8,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "12px 14px",
                minHeight: 44,
                fontSize: 14,
                fontWeight: 600,
                color: "#334155",
                lineHeight: 1.45,
              }}
            >
              {TYPED.map((seg, i) => {
                const delay = `${(0.55 + i * 0.07).toFixed(2)}s`;
                return seg.ch ? (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      whiteSpace: "nowrap",
                      animation: `mi-char-type 0.08s linear ${delay} both`,
                      ...(seg.red ? { color: "#ef4444", fontWeight: 800 } : null),
                    }}
                  >
                    {seg.ch}
                  </span>
                ) : (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      width: "0.4em",
                      animation: `mi-char-type 0.08s linear ${delay} both`,
                    }}
                  />
                );
              })}
              <span
                style={{
                  display: "inline-block",
                  width: 2,
                  height: 16,
                  marginLeft: 2,
                  verticalAlign: -2,
                  background: "#3182f6",
                  animation:
                    "mi-caret-blink 0.8s step-end infinite, mi-caret-hide 0.2s linear 2.25s both",
                }}
              />
            </div>

            {/* 응답하기 버튼 */}
            <div style={{ position: "relative", marginTop: 14 }}>
              {/* 호버 효과: 커서가 닿는 시점(≈3.18s)에 켜지는 그라디언트 테두리 글로우 */}
              <div
                style={{
                  position: "absolute",
                  inset: -3,
                  borderRadius: 19,
                  background:
                    "linear-gradient(100deg, #2272eb 0%, #4593fc 30%, #c9e2ff 50%, #4593fc 70%, #2272eb 100%)",
                  backgroundSize: "300% 100%",
                  boxShadow: "0 0 18px rgba(69, 147, 252, 0.45)",
                  opacity: 0,
                  animation:
                    "mi-scene-in 0.25s ease 3.15s both, mi-border-flow 1.6s linear 3.15s infinite",
                }}
              />
              <div
                style={{
                  position: "relative",
                  height: 50,
                  borderRadius: 16,
                  background: "linear-gradient(135deg, #2272eb 0%, #3182f6 45%, #4593fc 100%)",
                  color: "#ffffff",
                  fontSize: 15,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(49, 130, 246, 0.25)",
                  animation: "mi-press 0.35s ease 3.24s",
                }}
              >
                응답하기
              </div>
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 44,
                  height: 44,
                  margin: "-22px 0 0 -22px",
                  borderRadius: 999,
                  background: "rgba(255, 255, 255, 0.55)",
                  opacity: 0,
                  animation: "mi-click-ring 0.5s ease-out 3.26s both",
                }}
              />
            </div>

            {/* 커서 */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                zIndex: 5,
                pointerEvents: "none",
                animation: "mi-cursor-submit 1.3s linear 2.3s both",
              }}
            >
              <svg width="22" height="24" viewBox="0 0 22 24" aria-hidden="true">
                <path
                  d="M3 1 L3 19 L7.6 14.8 L10.8 22 L14 20.6 L10.8 13.4 L17 13 Z"
                  fill="#0f172a"
                  stroke="#ffffff"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

        </div>
      </div>

      {/* ════ 장면 2 · 응답 수렴 + 분석 필 (4.6 ~ 9.1s) ════ */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          animation: "mi-scene-in 0.45s ease 4.6s both, mi-scene-out 0.45s ease 8.7s both",
          opacity: 0,
        }}
      >
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 340, transform: "translateX(-50%)" }}>
          {BADGES.map((b) => (
            <div
              key={b.name}
              style={{
                position: "absolute",
                ...b.pos,
                animation: `mi-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${b.pop}s both`,
              }}
            >
              <div style={{ animation: b.float }}>
                <AttendeeTag required={b.required} name={b.name} />
              </div>
            </div>
          ))}

          {/* 뱃지에서 나와 중앙으로 수렴하는 응답 칩 */}
          {CHIPS.map((c) => {
            const chipStyle: ChipStyle = {
              position: "absolute",
              ...c.pos,
              "--dx": `${c.dx}px`,
              "--dy": `${c.dy}px`,
              borderRadius: 999,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              fontSize: 12,
              fontWeight: 700,
              padding: "5px 11px",
              boxShadow: "0 4px 10px rgba(185, 28, 28, 0.08)",
              opacity: 0,
              animation: `mi-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${c.pop}s both, mi-converge 0.7s cubic-bezier(0.55, 0, 0.55, 0.2) ${c.converge}s both`,
            };
            return (
              <div key={c.label} style={chipStyle}>
                {c.label}
              </div>
            );
          })}

          {/* 글로우 */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 265,
              width: 280,
              height: 280,
              marginLeft: -140,
              marginTop: -140,
              borderRadius: 999,
              background:
                "radial-gradient(circle, rgba(49, 130, 246, 0.32) 0%, rgba(49, 130, 246, 0) 68%)",
              filter: "blur(6px)",
              animation:
                "mi-scene-in 0.6s ease 5.3s both, mi-glow-pulse 2.4s ease-in-out 5.9s infinite",
              opacity: 0,
            }}
          />

          {/* 분석 필: 그라디언트 라이트닝 테두리 */}
          <div style={{ position: "absolute", left: "50%", top: 265, transform: "translate(-50%, -50%)" }}>
            <div
              style={{
                position: "relative",
                animation:
                  "mi-pill-in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 5.2s both, mi-pill-bump 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) 6.6s, mi-pill-bump 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) 6.85s, mi-pill-bump 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) 7.1s, mi-pill-bump 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) 7.35s",
                opacity: 0,
              }}
            >
              <div
                style={{
                  borderRadius: 999,
                  padding: 2.5,
                  background:
                    "linear-gradient(100deg, #2272eb 0%, #4593fc 30%, #c9e2ff 50%, #4593fc 70%, #2272eb 100%)",
                  backgroundSize: "300% 100%",
                  animation: "mi-border-flow 1.6s linear 5.4s infinite",
                  boxShadow: "0 10px 30px rgba(49, 130, 246, 0.3)",
                }}
              >
                <div
                  style={{
                    whiteSpace: "nowrap",
                    borderRadius: 999,
                    padding: "12px 22px",
                    background: "#ffffff",
                    color: "#1b64da",
                    fontSize: 15,
                    fontWeight: 800,
                  }}
                >
                  분석 중…
                </div>
              </div>
            </div>
          </div>

          <SceneCaption text="모두의 응답을 모아서 해석하고" delay={5} />
        </div>
      </div>

      {/* ════ 장면 3 · 달력 스캔 → 탈락 → 낙하 (9.1 ~ 13.25s) ════ */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          animation: "mi-scene-in 0.45s ease 9.1s both, mi-scene-out 0.45s ease 12.8s both",
          opacity: 0,
        }}
      >
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 340, transform: "translateX(-50%)" }}>
          {/* 달력 카드 — 온전한 칸들이 먼저 보이고, 스캔 광선이 훑은 뒤 탈락 칸이 빨갛게 물들어 낙하한다 */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 120,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 20,
              padding: 16,
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
              animation: "mi-card-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) 9.2s both",
            }}
          >
            {/* 캘린더 아이콘(타이틀 대체) */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="3" stroke="#3182f6" strokeWidth="2" />
              <path d="M3 10h18" stroke="#3182f6" strokeWidth="2" />
              <path d="M8 3v4M16 3v4" stroke="#3182f6" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 4,
                textAlign: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#94a3b8",
              }}
            >
              <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
            </div>
            {/* 날짜칸 영역 — 스캔 광선은 이 영역만 훑는다 */}
            <div style={{ position: "relative", marginTop: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                <div />
                <div />
                <div />
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                  const fallIndex = CELL_FALL[day];
                  if (fallIndex === undefined) return <div key={day} style={cellStyle} />;
                  // 탈락 칸: 스캔이 지나간 뒤 빨갛게 물들고(mark), 순서대로 좌우로 기울며 떨어진다(fall).
                  const mark = (MARK_BASE + fallIndex * MARK_STEP).toFixed(2);
                  const fall = (FALL_BASE + fallIndex * FALL_STEP).toFixed(2);
                  return (
                    <div
                      key={day}
                      style={{
                        ...cellStyle,
                        animation: `mi-cell-mark 0.3s ease ${mark}s both, ${day % 2 === 0 ? "mi-cell-fall-r" : "mi-cell-fall-l"} 0.7s cubic-bezier(0.45, 0, 0.9, 0.5) ${fall}s both`,
                      }}
                    />
                  );
                })}
                <div />
              </div>

              {/* 스캔 광선 — 흰빛이 날짜칸 위를 한 번 훑고 지나간다 */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 8,
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: "55%",
                    background:
                      "linear-gradient(105deg, rgba(148, 163, 184, 0) 0%, rgba(203, 213, 225, 0.4) 42%, rgba(255, 255, 255, 0.95) 50%, rgba(203, 213, 225, 0.4) 58%, rgba(148, 163, 184, 0) 100%)",
                    transform: "translateX(-130%)",
                    animation: "mi-scan 0.8s ease-in-out 9.9s both",
                  }}
                />
              </div>
            </div>
          </div>

          <SceneCaption text="어려운 날은 덜어내면" delay={9.5} />
        </div>
      </div>

      {/* ════ 장면 4 · 추천 후보 리스트 → 위로 팡 → 워드마크 (12.9s ~ 끝) ════ */}
      <div style={{ position: "absolute", inset: 0, animation: "mi-scene-in 0.45s ease 12.9s both", opacity: 0 }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 340, transform: "translateX(-50%)" }}>
          {/* 후보 리스트 12줄 — 순차 등장 후 위로 빠르게 날아간다 */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "46%",
              transform: "translateY(-50%)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {CANDIDATE_DATES.map((date, i) => (
              <div
                key={date}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: CANDIDATE_GRADIENTS[i % CANDIDATE_GRADIENTS.length],
                  border: "1px solid #c9e2ff",
                  borderRadius: 13,
                  padding: "8px 18px",
                  boxShadow: "0 3px 10px rgba(49, 130, 246, 0.09)",
                  animation: `mi-fade-up 0.4s ease-out ${(13.05 + i * 0.06).toFixed(2)}s both, mi-list-up 0.35s cubic-bezier(0.5, 0, 1, 0.5) ${(14.4 + i * 0.03).toFixed(2)}s forwards`,
                  opacity: 0,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1b64da" }}>{date}</span>
              </div>
            ))}
          </div>

          {/* 팡 버스트 + 마무리 워드마크 */}
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", textAlign: "center" }}>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 240,
                height: 240,
                margin: "-120px 0 0 -120px",
                borderRadius: 999,
                background:
                  "radial-gradient(circle, rgba(69, 147, 252, 0.45) 0%, rgba(144, 194, 255, 0.25) 40%, rgba(49, 130, 246, 0) 70%)",
                opacity: 0,
                animation: "mi-burst 0.6s ease-out 15.1s both",
              }}
            />
            <div
              style={{
                position: "relative",
                animation: "mi-pop-in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 15.15s both",
                opacity: 0,
              }}
            >
              <Wordmark />
            </div>
          </div>

          <SceneCaption text="모두가 되는 시간만 남아요" delay={13} flyAt={14.4} />
        </div>
      </div>
    </div>
  );
}

export function LandingIntro() {
  const [phase, setPhase] = useState<Phase>("pending");

  const finish = useCallback(() => {
    setPhase("done");
  }, []);

  // 새로고침을 포함해 페이지가 열릴 때마다 처음부터 재생한다(저감 모션만 마지막 장면 + CTA 바로 표시).
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase(reduced ? "done" : "playing");
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = setTimeout(finish, INTRO_DURATION_MS);
    return () => clearTimeout(timer);
  }, [phase, finish]);

  const ctaShown = phase === "done";

  return (
    <>
      <style>{KEYFRAMES}</style>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 pb-40 pt-6 sm:px-6 sm:pb-44">
        <div
          role="img"
          aria-label="modu 사용 흐름을 보여주는 인트로 애니메이션 — 어려운 시간만 알려주면 응답을 모아 해석해서 가장 나은 시간을 찾아드려요"
          className="relative w-full overflow-hidden rounded-3xl bg-white"
          style={{ height: "clamp(500px, calc(100dvh - 240px), 560px)" }}
        >
          {phase === "playing" && <MotionScenes />}

          {phase === "done" && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Wordmark />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 하단 고정 CTA — 인트로가 끝나야 페이드인. PC·모바일 공통, CTA 아래에는 아무것도 두지 않는다. */}
      <div
        aria-hidden={!ctaShown}
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 bg-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 transition-opacity duration-500",
          ctaShown ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-full h-6 bg-gradient-to-b from-white/0 to-white"
        />
        {/* 다른 페이지 CTA 와 같은 폭: 본문 컬럼(max-w-2xl + sm:px-6)에 맞춘다 */}
        <div className="mx-auto w-full max-w-2xl sm:px-6">
          <p className="mb-2 text-center text-xs font-medium text-slate-400">
            지금은 데모로 열려 있어요 — 마음껏 눌러보세요
          </p>
          <StartMeetingButton display="block" />
        </div>
      </div>
    </>
  );
}
