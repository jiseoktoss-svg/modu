import type { DateAvailabilitySummary } from "@/lib/scheduler/dateAvailabilitySummary";

export type CalendarDateQualityTier = "high" | "medium" | "low";

export type CalendarDateQuality = {
  score: number;
  tier: CalendarDateQualityTier;
  filledDots: 1 | 2 | 3;
  label: string;
};

const TIER_META: Record<
  CalendarDateQualityTier,
  { filledDots: 1 | 2 | 3; label: string }
> = {
  high: { filledDots: 3, label: "전체 기간 기준 상위 추천 날짜" },
  medium: { filledDots: 2, label: "전체 기간 기준 중간 추천 날짜" },
  low: { filledDots: 1, label: "전체 기간 기준 낮은 추천 날짜" },
};

export function scoreDateAvailabilitySummary(summary: DateAvailabilitySummary): number | null {
  const bestSlot = summary.bestSlot;
  if (!bestSlot || summary.totalSlots <= 0) return null;

  const allAvailableRatio = summary.allAvailableSlots.length / summary.totalSlots;
  const requiredIssueRatio = summary.requiredIssueSlots.length / summary.totalSlots;
  const pendingRatio = summary.pendingSlots.length / summary.totalSlots;

  return (
    bestSlot.requiredBusyNames.length * -100000 +
    bestSlot.requiredPendingNames.length * -80000 +
    bestSlot.totalAvailable * 1000 +
    bestSlot.totalBusy * -100 +
    bestSlot.totalPending * -50 +
    allAvailableRatio * 100 +
    requiredIssueRatio * -60 +
    pendingRatio * -30 +
    (summary.allSlotsAllAvailable ? 20 : 0) +
    (summary.allSlotsRequiredAvailable ? 10 : 0)
  );
}

export function rankDateAvailabilitySummaries(
  summaries: Iterable<[string, DateAvailabilitySummary]>,
): Map<string, CalendarDateQuality> {
  const scored = [...summaries]
    .map(([date, summary]) => {
      const score = scoreDateAvailabilitySummary(summary);
      return score === null ? null : { date, score };
    })
    .filter((entry): entry is { date: string; score: number } => entry !== null);

  const uniqueScores = [...new Set(scored.map((entry) => entry.score))].sort((a, b) => b - a);
  const denominator = Math.max(1, uniqueScores.length - 1);
  const ranked = new Map<string, CalendarDateQuality>();

  for (const entry of scored) {
    const rankIndex = uniqueScores.indexOf(entry.score);
    const percentile = rankIndex / denominator;
    const tier: CalendarDateQualityTier =
      percentile <= 1 / 3 ? "high" : percentile <= 2 / 3 ? "medium" : "low";
    const meta = TIER_META[tier];
    ranked.set(entry.date, {
      score: entry.score,
      tier,
      filledDots: meta.filledDots,
      label: meta.label,
    });
  }

  return ranked;
}
