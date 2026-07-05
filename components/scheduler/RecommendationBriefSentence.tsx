"use client";

import type { ReactNode } from "react";
import { AttendeeNameBadge } from "@/components/scheduler/AttendeeNameBadge";
import { cn } from "@/lib/cn";
import type { RecommendationBrief } from "@/lib/scheduler/recommendationBrief";

// 추천안 화면의 문장형 추천 요약 — 회의 만들기/응답 입력의 문장 빌더 톤을 잇는다.
// modu 가 먼저 판단(headline)을 정리해주고 이유를 덧붙이는 답변처럼 읽히게 한다.
// 날짜 키워드는 브랜드색(먼저 볼 날짜)/빨강(피하면 좋은 날짜)으로, 참석자 이름은 '필수/선택' 벳지로 노출한다.

type RecommendationBriefSentenceProps = {
  brief: RecommendationBrief;
};

// 문장 안의 특정 토큰(날짜 라벨·이름)을 노드로 치환한다. 긴 토큰부터 처리해 부분 매칭을 막는다.
type SentenceToken = { text: string; render: (matched: string, key: string) => ReactNode };

function replaceTokens(sentence: string, tokens: SentenceToken[]): ReactNode[] {
  const sorted = [...tokens].sort((a, b) => b.text.length - a.text.length);
  let parts: ReactNode[] = [sentence];
  sorted.forEach((token, ti) => {
    const next: ReactNode[] = [];
    for (const part of parts) {
      if (typeof part !== "string" || !part.includes(token.text)) {
        next.push(part);
        continue;
      }
      const pieces = part.split(token.text);
      pieces.forEach((piece, i) => {
        if (piece) next.push(piece);
        if (i < pieces.length - 1) {
          next.push(token.render(token.text, `${ti}-${i}-${token.text}`));
        }
      });
    }
    parts = next;
  });
  return parts;
}

export function RecommendationBriefSentence({ brief }: RecommendationBriefSentenceProps) {
  const colorToken = (text: string, className: string): SentenceToken => ({
    text,
    render: (matched, key) => (
      <span key={key} className={className}>
        {matched}
      </span>
    ),
  });
  // 날짜 라벨: 먼저 볼 날짜(브랜드색)/피하면 좋은 날짜(빨강). 서로 겹치지 않아 어느 문장에 나오든 각자 색.
  const dateTokens: SentenceToken[] = [
    ...brief.primaryItems.map((item) => colorToken(item.label, "font-bold text-brand-600")),
    ...brief.avoidItems.map((item) => colorToken(item.label, "font-bold text-red-500")),
  ];
  // 참석자 이름은 "{name}님" 형태로 등장 — '필수/선택' 벳지로 치환한다.
  const nameTokens: SentenceToken[] = brief.nameBadges.map((badge) => ({
    text: `${badge.name}님`,
    render: (_, key) => (
      <AttendeeNameBadge key={key} name={badge.name} attendanceType={badge.attendanceType} />
    ),
  }));
  const tokens = [...nameTokens, ...dateTokens];

  // 문장 줄들: 등장 순서대로 살짝 시차를 두고 떠오른다(문장 빌더 톤).
  // 판단(headline)부터 바로 말하고, 근거 문장을 이어 붙인다.
  const lines: { node: ReactNode; className: string }[] = [
    {
      node: brief.headline,
      className: "text-xl font-extrabold leading-snug text-slate-900 sm:text-2xl",
    },
    {
      node: replaceTokens(brief.primarySentence, tokens),
      className: "break-keep text-base leading-relaxed text-slate-700",
    },
  ];
  if (brief.avoidSentence) {
    lines.push({
      node: replaceTokens(brief.avoidSentence, tokens),
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
