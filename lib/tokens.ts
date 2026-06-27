import "server-only";
import { randomBytes } from "node:crypto";

// 링크 기반 알파에서 토큰은 사실상 접근 자격증명이다.
// 추측 불가능하도록 충분한 엔트로피(기본 24바이트 ≈ 192bit)의 난수를 쓴다.
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
