export const MAX_PARTICIPANT_NAME_LENGTH = 20;

export function normalizeParticipantName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function participantNameKey(value: string): string {
  return normalizeParticipantName(value).toLocaleLowerCase("ko-KR");
}

export function validateParticipantName(value: string): string | null {
  const name = normalizeParticipantName(value);
  if (!name) return "이름이나 별명을 입력해 주세요.";
  if (name.length > MAX_PARTICIPANT_NAME_LENGTH) {
    return `이름이나 별명은 최대 ${MAX_PARTICIPANT_NAME_LENGTH}글자까지 입력할 수 있어요.`;
  }
  return null;
}
