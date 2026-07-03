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
    ? "필수 참석자 모두 참석할 수 있는 시간이에요."
    : "필수 참석자 중 일부는 아직 응답 전이라 바뀔 수 있어요.";

  const lines = [
    "[modu] 회의 시간이 정해졌어요.",
    `회의명: ${input.title}`,
    input.agenda ? `안건: ${input.agenda}` : null,
    input.location ? `장소: ${input.location}` : null,
    `시간: ${formatKoreanDateTimeRange(input.startAt, input.endAt)}`,
    requiredLine,
  ].filter(Boolean);

  return lines.join("\n");
}
