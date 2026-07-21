import { describe, expect, it } from "vitest";
import {
  MAX_PARTICIPANT_NAME_LENGTH,
  normalizeParticipantName,
  participantNameKey,
  validateParticipantName,
} from "@/lib/participantIdentity";

describe("participant identity", () => {
  it("앞뒤 공백과 연속 공백을 정리한다", () => {
    expect(normalizeParticipantName("  김   모두  ")).toBe("김 모두");
  });

  it("대소문자와 공백이 다른 같은 이름을 동일한 키로 본다", () => {
    expect(participantNameKey("  MOA Friend ")).toBe(participantNameKey("moa   friend"));
  });

  it("빈 이름과 글자 수 제한을 검증한다", () => {
    expect(validateParticipantName("   ")).toBe("이름이나 별명을 입력해 주세요.");
    expect(validateParticipantName("가".repeat(MAX_PARTICIPANT_NAME_LENGTH + 1))).toContain(
      `${MAX_PARTICIPANT_NAME_LENGTH}글자`,
    );
    expect(validateParticipantName("모두")).toBeNull();
  });
});
