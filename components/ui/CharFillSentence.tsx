"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  CHAR_FILL_DURATION_MS,
  CHAR_FILL_STEP_MS,
  charFillSlot,
  charFillTiming,
  splitGraphemes,
  type CharFillSegment,
} from "@/lib/charFill";

// 글자 잉크 채움 문장 공용 컴포넌트 — 회의 확인·회의 안내·입력 확인이 함께 쓴다.
// 투명 밑글(레이아웃 담당) 위에 실제 문장을 겹치고, 절 안 글자들을 읽는 순서대로
// 칠한다(.modu-fill-char mask+blur 스윕). 채움이 끝나면 mask 를 걷어 일반 렌더링으로
// 되돌리고, 값 조각(wrap)에 shine=true 를 전달해 shine 을 켠다.
// 마운트 시 채움이 시작되고 언마운트로 리셋된다(화면 전환 시 자동 초기화).

interface CharFillParagraph {
  clauses: CharFillSegment[][];
  className?: string;
}

interface CharFillSentenceProps {
  /** 문단 목록. 절(clause) 사이에는 호흡(CHAR_FILL_CLAUSE_GAP_MS)이 들어간다. */
  paragraphs: CharFillParagraph[];
  /** 채움 완료 시점(mask 해제·shine 점등)에 한 번 호출. CTA 게이팅 등에 쓴다. */
  onFillDone?: () => void;
  /** 채움 완료 후에도 글자 span 구조를 유지하고 mask 클래스만 걷는다.
   *  완료 순간 span→일반 텍스트 DOM 교체가 사라져, 긴 문장(회의 확인)에서 보이는
   *  한 번의 번쩍임을 막는다. 기본값 false — 기존 화면들은 종전 동작 그대로다. */
  retainCharSpans?: boolean;
  className?: string;
}

export function CharFillSentence({
  paragraphs,
  onFillDone,
  retainCharSpans = false,
  className,
}: CharFillSentenceProps) {
  const clauses = paragraphs.flatMap((p) => p.clauses);
  const { clauseStartsMs, fillEndMs } = charFillTiming(clauses);

  const [fillDone, setFillDone] = useState(false);
  // 콜백은 ref 로 들고 있어 인라인 함수가 매 렌더 바뀌어도 타이머가 리셋되지 않는다.
  const onFillDoneRef = useRef(onFillDone);
  useEffect(() => {
    onFillDoneRef.current = onFillDone;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFillDone(true);
      onFillDoneRef.current?.();
    }, fillEndMs);
    return () => window.clearTimeout(timer);
  }, [fillEndMs]);

  // 절 안 글자들을 읽는 순서대로 칠하는 렌더러.
  // animate=false 면 마스크 없이 렌더한다(투명 밑글 레이어·채움 완료 후 공용).
  // keepSpans=true 면 완료 후에도 글자 span 을 유지한 채 클래스만 걷는다 — React 가
  // DOM 교체 없이 속성만 지워 리페인트가 최소화된다(같은 key 로 자리 유지).
  const renderClause = (
    segments: CharFillSegment[],
    clauseIndex: number,
    animate: boolean,
    shine: boolean,
    keepSpans: boolean,
  ) => {
    let slot = 0;
    const renderChars = (text: string): ReactNode => {
      if (!animate && !keepSpans) return text;
      return splitGraphemes(text).map((ch, i) => {
        // 공백은 슬롯을 쓰지 않고 그대로 렌더한다(칠하는 동안 멈칫하는 구간 제거).
        if (ch === " ") return " ";
        if (!animate) return <span key={i}>{ch}</span>;
        const delay = clauseStartsMs[clauseIndex] + slot * CHAR_FILL_STEP_MS;
        slot += charFillSlot(ch);
        return (
          <span
            key={i}
            className="modu-fill-char"
            style={{
              animationDelay: `${Math.round(delay)}ms`,
              animationDuration: `${CHAR_FILL_DURATION_MS}ms`,
            }}
          >
            {ch}
          </span>
        );
      });
    };
    return (
      <>
        {segments.map((seg, i) =>
          typeof seg === "string" ? (
            <span key={i}>{renderChars(seg)}</span>
          ) : (
            <Fragment key={i}>{seg.wrap(renderChars(seg.text), shine)}</Fragment>
          ),
        )}{" "}
      </>
    );
  };

  const renderLayer = (animate: boolean, shine: boolean, keepSpans: boolean) => {
    let clauseIndex = 0;
    return paragraphs.map((paragraph, pi) => (
      <p key={pi} className={paragraph.className}>
        {paragraph.clauses.map((clause) => {
          const i = clauseIndex;
          clauseIndex += 1;
          return <span key={i}>{renderClause(clause, i, animate, shine, keepSpans)}</span>;
        })}
      </p>
    ));
  };

  return (
    <div
      className={cn(
        "relative break-keep text-2xl leading-relaxed text-slate-800 sm:text-3xl sm:leading-relaxed",
        className,
      )}
    >
      {/* 투명 밑글 — 레이아웃(높이)만 담당. 채워지기 전 텍스트는 보이지 않는다.
          retainCharSpans 면 밑글도 같은 span 구조로 렌더한다 — 글자별 span 은 일반
          텍스트와 줄바꿈 지점이 달라질 수 있어, 구조가 다르면 실제 문장(절대배치)이
          밑글이 잡은 높이를 넘쳐 아래 요소를 덮는다. */}
      <div aria-hidden="true" inert className="pointer-events-none select-none opacity-0">
        {renderLayer(false, false, retainCharSpans)}
      </div>
      {/* 실제 문장 — 글자 단위 잉크 채움. 완료 후엔 mask 를 걷고 값에 shine 을 켠다. */}
      <div className="absolute inset-0">
        {renderLayer(!fillDone, fillDone, fillDone && retainCharSpans)}
      </div>
    </div>
  );
}
