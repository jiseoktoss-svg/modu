import { describe, expect, it } from "vitest";
import { parseAvailabilitySearch } from "@/lib/scheduler/parseAvailabilitySearch";

// 특정 시간 검색어 파서 — 단순 패턴만 지원한다(복잡한 자연어 처리 없음).

const DATES = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"];

describe("parseAvailabilitySearch", () => {
  it("1. '7/15 14시'를 YYYY-MM-DD + 14:00 으로 파싱한다", () => {
    const parsed = parseAvailabilitySearch("7/15 14시", { dates: DATES });
    expect(parsed).toEqual({ ok: true, date: "2026-07-15", startMinute: 14 * 60, endMinute: undefined });
  });

  it("2. '7월 15일 오후 2시'를 14:00 으로 파싱한다", () => {
    const parsed = parseAvailabilitySearch("7월 15일 오후 2시", { dates: DATES });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.date).toBe("2026-07-15");
      expect(parsed.startMinute).toBe(14 * 60);
    }
  });

  it("3. '2026-07-15 14:00'을 파싱한다", () => {
    const parsed = parseAvailabilitySearch("2026-07-15 14:00", { dates: DATES });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.date).toBe("2026-07-15");
      expect(parsed.startMinute).toBe(14 * 60);
    }
  });

  it("4. 시간이 없으면 에러를 반환한다", () => {
    const parsed = parseAvailabilitySearch("7/15", { dates: DATES });
    expect(parsed).toEqual({ ok: false, error: "시간까지 입력해 주세요. 예: 7/15 14시" });
  });

  it("5. 회의 날짜 범위 밖이면 에러를 반환한다", () => {
    const parsed = parseAvailabilitySearch("8/20 14시", { dates: DATES });
    expect(parsed).toEqual({ ok: false, error: "회의 기간 안의 날짜만 확인할 수 있어요." });
  });

  it("6. '7/15 14:00~15:00' 범위 입력은 endMinute 까지 파싱한다", () => {
    const parsed = parseAvailabilitySearch("7/15 14:00~15:00", { dates: DATES });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.startMinute).toBe(14 * 60);
      expect(parsed.endMinute).toBe(15 * 60);
    }
  });

  it("7. '14시 30분'처럼 분 단위와 '오전' 표기를 지원한다", () => {
    const withMinute = parseAvailabilitySearch("7월 15일 14시 30분", { dates: DATES });
    expect(withMinute.ok).toBe(true);
    if (withMinute.ok) expect(withMinute.startMinute).toBe(14 * 60 + 30);

    const morning = parseAvailabilitySearch("7/15 오전 10시", { dates: DATES });
    expect(morning.ok).toBe(true);
    if (morning.ok) expect(morning.startMinute).toBe(10 * 60);
  });

  it("8. 날짜를 읽을 수 없으면 날짜·시간 입력 안내 에러를 반환한다", () => {
    const parsed = parseAvailabilitySearch("오후 2시", { dates: DATES });
    expect(parsed).toEqual({ ok: false, error: "날짜와 시간을 함께 입력해 주세요. 예: 7/15 14시" });
  });
});
