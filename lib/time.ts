// 시간 유틸리티.
// modu 는 한국(Asia/Seoul, KST, +09:00) 기준 서비스다. 한국은 서머타임이 없어
// 항상 고정 +09:00 오프셋으로 처리할 수 있다. 모든 슬롯/표시 시각은 KST 벽시계 기준이며,
// 저장은 ISO(+09:00 또는 UTC) 절대 시각으로 한다.

export const KST_OFFSET_MINUTES = 540; // +09:00

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** "09:00" -> 540 (자정 이후 분) */
export function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** 540 -> "09:00" */
export function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/**
 * KST 벽시계(날짜 + 자정 이후 분)를 +09:00 오프셋이 붙은 ISO 문자열로 만든다.
 * 예: ("2026-07-01", 840) -> "2026-07-01T14:00:00+09:00"
 */
export function kstWallToIso(dateStr: string, minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60);
  const m = minutesSinceMidnight % 60;
  return `${dateStr}T${pad2(h)}:${pad2(m)}:00+09:00`;
}

/** ISO -> epoch ms (절대 시각). 오프셋 표기와 무관하게 동일 시각이면 동일 값. */
export function isoToEpoch(iso: string): number {
  return Date.parse(iso);
}

/** ISO 문자열을 KST 벽시계 구성요소로 분해한다. */
export function getKstParts(iso: string): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  weekday: number; // 0=일
} {
  const shifted = new Date(isoToEpoch(iso) + KST_OFFSET_MINUTES * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** "2026년 7월 1일 수요일" */
export function formatKoreanDate(iso: string): string {
  const p = getKstParts(iso);
  return `${p.year}년 ${p.month}월 ${p.day}일 ${WEEKDAYS_KO[p.weekday]}요일`;
}

/** "14:00" (KST) */
export function formatKoreanTime(iso: string): string {
  const p = getKstParts(iso);
  return `${pad2(p.hours)}:${pad2(p.minutes)}`;
}

/** "14:00~15:00" (KST) */
export function formatKoreanTimeRange(startIso: string, endIso: string): string {
  return `${formatKoreanTime(startIso)}~${formatKoreanTime(endIso)}`;
}

/** "2026년 7월 1일 수요일 14:00~15:00" */
export function formatKoreanDateTimeRange(startIso: string, endIso: string): string {
  return `${formatKoreanDate(startIso)} ${formatKoreanTimeRange(startIso, endIso)}`;
}

// ---- 날짜(YYYY-MM-DD) 산술 ----
// tz 드리프트를 피하기 위해 Date.UTC 기반 정수 산술만 사용한다.

function dateStrToUtcEpoch(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcEpochToDateStr(epoch: number): string {
  const d = new Date(epoch);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  return utcEpochToDateStr(dateStrToUtcEpoch(dateStr) + days * 86400000);
}

/** 기준 시각(now)의 KST 오늘 날짜를 YYYY-MM-DD 로 반환한다. */
export function todayDateStrKst(now: Date = new Date()): string {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MINUTES * 60000);
  return `${kstNow.getUTCFullYear()}-${pad2(kstNow.getUTCMonth() + 1)}-${pad2(
    kstNow.getUTCDate(),
  )}`;
}

/** [startDate, endDate] 범위의 모든 날짜(YYYY-MM-DD)를 반환한다 (양끝 포함). */
export function eachDateInRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  let cur = dateStrToUtcEpoch(startDate);
  const end = dateStrToUtcEpoch(endDate);
  // 무한루프 방지: 최대 366일.
  let guard = 0;
  while (cur <= end && guard < 366) {
    out.push(utcEpochToDateStr(cur));
    cur += 86400000;
    guard += 1;
  }
  return out;
}

/** 0=일 ... 6=토 (KST 기준 요일) */
function weekdayOfDateStr(dateStr: string): number {
  return new Date(dateStrToUtcEpoch(dateStr)).getUTCDay();
}

/** 기준 시각(now) 기준으로 "다음 주 월요일 ~ 금요일" 날짜 범위를 계산한다. */
export function nextWeekMonToFri(now: Date): { dateStart: string; dateEnd: string } {
  // now 를 KST 날짜로 변환.
  const todayStr = todayDateStrKst(now);
  const dow = weekdayOfDateStr(todayStr); // 0=일..6=토
  const daysSinceMonday = (dow + 6) % 7; // 월=0
  const thisMonday = addDaysToDateStr(todayStr, -daysSinceMonday);
  const nextMonday = addDaysToDateStr(thisMonday, 7);
  const nextFriday = addDaysToDateStr(nextMonday, 4);
  return { dateStart: nextMonday, dateEnd: nextFriday };
}

/** "YYYY-MM-DD" -> { weekdayKo: "수", monthDay: "7/1" } (KST 달력 기준) */
export function describeDateStr(dateStr: string): { weekdayKo: string; monthDay: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { weekdayKo: WEEKDAYS_KO[weekday], monthDay: `${m}/${d}` };
}

/** ISO -> UTC 기준 iCalendar 형식 "YYYYMMDDTHHMMSSZ" */
export function formatIcsUtc(iso: string): string {
  const d = new Date(isoToEpoch(iso));
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}
