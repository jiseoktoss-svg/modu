import { formatKoreanDateTimeRange } from "@/lib/time";

// 확정 후 공유 문구를 생성한다 (서버/클라이언트 공용, 순수 함수).

export interface ShareTextInput {
  title: string;
  agenda?: string;
  location?: string;
  startAt: string;
  endAt: string;
  requiredAllAvailable: boolean;
}

export function buildShareText(input: ShareTextInput): string {
  const requiredLine = input.requiredAllAvailable
    ? "꼭 함께할 사람이 모두 참여할 수 있는 시간이에요."
    : "꼭 함께할 사람 중 일부는 아직 응답 전이라 바뀔 수 있어요.";

  const lines = [
    "[MOA] 함께할 시간이 정해졌어요.",
    `일정 이름: ${input.title}`,
    input.agenda ? `일정 내용: ${input.agenda}` : null,
    input.location ? `장소: ${input.location}` : null,
    `시간: ${formatKoreanDateTimeRange(input.startAt, input.endAt)}`,
    requiredLine,
  ].filter(Boolean);

  return lines.join("\n");
}
