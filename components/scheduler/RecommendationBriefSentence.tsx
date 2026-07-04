"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { RecommendationBrief } from "@/lib/scheduler/recommendationBrief";

// 추천안 화면의 문장형 추천 요약 — 회의 만들기/응답 입력의 문장 빌더 톤을 잇는다.
// "모두의 응답을 보니," 로 시작해 modu 가 먼저 판단을 정리해주는 답변처럼 읽히게 한다.
// 날짜 키워드는 파랑(먼저 볼 날짜)/빨강(피하면 좋은 날짜)으로 강조한다.

type RecommendationBriefSentenceProps = {
  brief: RecommendationBrief;
};

/** 문장 안의 날짜 라벨을 색 키워드로 감싼다(먼저 나온 키워드부터 순차 분해). */
function highlightKeywords(
  sentence: string,
  keywords: { text: string; className: string }[],
): ReactNode[] {
  let parts: ReactNode[] = [sentence];
  keywords.forEach((keyword, ki) => {
    const next: ReactNode[] = [];
    for (const part of parts) {
      if (typeof part !== "string" || !part.includes(keyword.text)) {
        next.push(part);
        continue;
      }
      const pieces = part.split(keyword.text);
      pieces.forEach((piece, i) => {
        if (piece) next.push(piece);
        if (i < pieces.length - 1) {
          next.push(
            <span key={`${ki}-${i}-${keyword.text}`} className={keyword.className}>
              {keyword.text}
            </span>,
          );
        }
      });
    }
    parts = next;
  });
  return parts;
}

export function RecommendationBriefSentence({ brief }: RecommendationBriefSentenceProps) {
  const primaryKeywords = brief.primaryItems.map((item) => ({
    text: item.label,
    className: "font-bold text-brand-600",
  }));
  const avoidKeywords = brief.avoidItems.map((item) => ({
    text: item.label,
    className: "font-bold text-red-500",
  }));
  // 두 색을 모든 문장에 적용한다 — 먼저 볼 날짜(파랑)/피하면 좋은 날짜(빨강)는 서로 겹치지
  // 않아, 어느 문장에 나오든 각자 색으로 칠해진다(예: '제외하면' 예외 날짜도 빨강).
  const allKeywords = [...primaryKeywords, ...avoidKeywords];

  // 문장 줄들: 등장 순서대로 살짝 시차를 두고 떠오른다(문장 빌더 톤).
  // 도입부("모두의 응답을 보니,")는 두지 않는다 — 판단(headline)부터 바로 말한다.
  const lines: { node: ReactNode; className: string }[] = [
    {
      node: brief.headline,
      className: "text-xl font-extrabold leading-snug text-slate-900 sm:text-2xl",
    },
    {
      node: highlightKeywords(brief.primarySentence, allKeywords),
      className: "break-keep text-base leading-relaxed text-slate-700",
    },
  ];
  if (brief.avoidSentence) {
    lines.push({
      node: highlightKeywords(brief.avoidSentence, allKeywords),
      className: "break-keep text-base leading-relaxed text-slate-700",
    });
  }
  if (brief.helperSentence) {
    lines.push({
      node: brief.helperSentence,
      className: "break-keep text-sm text-slate-400",
    });
  }

  return (
    <div className="space-y-1.5 px-1">
      {lines.map((line, i) => (
        <p
          key={i}
          style={{ animationDelay: `${i * 120}ms`, animationDuration: "0.6s" }}
          className={cn("animate-fade-up-blur motion-reduce:animate-none", line.className)}
        >
          {line.node}
        </p>
      ))}
    </div>
  );
}
