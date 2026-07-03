// 한글 어미/조사 선택 유틸.

/** 마지막 글자의 받침 유무(서술격조사 '이에요/예요' 선택용). 한글 음절이 아니면 받침 없음으로 처리. */
export function hasBatchim(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const c = t.charCodeAt(t.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

/** "{값}이에요." / "{값}예요." 어미 — 문장 빌더의 동적 값 뒤에 붙인다. */
export function ieyo(s: string): string {
  return hasBatchim(s) ? "이에요." : "예요.";
}
