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
    ? "필수 참석자는 모두 참석 가능한 시간입니다."
    : "필수 참석자 중 일부는 아직 응답 전이라 변동될 수 있습니다.";

  const lines = [
    "[modu] 회의 시간이 확정되었습니다.",
    `회의명: ${input.title}`,
    input.agenda ? `안건: ${input.agenda}` : null,
    input.location ? `장소: ${input.location}` : null,
    `시간: ${formatKoreanDateTimeRange(input.startAt, input.endAt)}`,
    requiredLine,
  ].filter(Boolean);

  return lines.join("\n");
}
