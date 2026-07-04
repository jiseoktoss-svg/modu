// 특정 시간 검색어 파서.
// "7/15 14시", "7월 15일 오후 2시", "2026-07-15 14:00", "7/15 14:00~15:00" 정도의
// 단순 패턴만 지원한다(복잡한 자연어 처리는 하지 않는다).
// 연도가 없으면 회의 기간(dates)에 걸친 연도 중 기간 안에 들어오는 쪽을 쓴다.

export type ParsedAvailabilitySearch =
  | {
      ok: true;
      date: string; // YYYY-MM-DD
      startMinute: number; // 자정 이후 분
      /** 사용자가 "14:00~15:00"처럼 범위를 직접 쓴 경우에만 채워진다. */
      endMinute?: number;
    }
  | {
      ok: false;
      error: string;
    };

const ERROR_NEED_DATE_TIME = "날짜와 시간을 함께 입력해 주세요. 예: 7/15 14시";
const ERROR_NEED_TIME = "시간까지 입력해 주세요. 예: 7/15 14시";
const ERROR_OUT_OF_RANGE = "회의 기간 안의 날짜만 확인할 수 있어요.";

const pad2 = (n: number) => String(n).padStart(2, "0");

// 시간 토큰: "14:00" | "14시" | "14시 30분" | "오후 2시" | "오전 09:30"
const TIME_RE = /(오전|오후)?\s*(\d{1,2})(?::(\d{2})|\s*시(?:\s*(\d{1,2})\s*분)?)/g;

function toMinute(match: RegExpMatchArray): number | null {
  const meridiem = match[1];
  let hour = Number(match[2]);
  const minute = Number(match[3] ?? match[4] ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  if (meridiem === "오후" && hour < 12) hour += 12;
  if (meridiem === "오전" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return hour * 60 + minute;
}

export function parseAvailabilitySearch(
  rawQuery: string,
  opts: { dates: string[] },
): ParsedAvailabilitySearch {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  if (!query) return { ok: false, error: ERROR_NEED_DATE_TIME };

  const sorted = [...opts.dates].sort();
  const rangeStart = sorted[0];
  const rangeEnd = sorted[sorted.length - 1];
  if (!rangeStart || !rangeEnd) return { ok: false, error: ERROR_OUT_OF_RANGE };

  // 1) 날짜 추출 — YYYY-MM-DD > M월 D일 > M/D 순으로 시도하고, 남은 문자열에서 시간을 찾는다.
  let year: number | null = null;
  let month = 0;
  let day = 0;
  let rest = "";

  const isoMatch = query.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const koMatch = query.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  const slashMatch = query.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
    rest = query.replace(isoMatch[0], " ");
  } else if (koMatch) {
    month = Number(koMatch[1]);
    day = Number(koMatch[2]);
    rest = query.replace(koMatch[0], " ");
  } else if (slashMatch) {
    month = Number(slashMatch[1]);
    day = Number(slashMatch[2]);
    rest = query.replace(slashMatch[0], " ");
  } else {
    return { ok: false, error: ERROR_NEED_DATE_TIME };
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, error: ERROR_NEED_DATE_TIME };
  }

  // 2) 시간 추출 — 첫 토큰이 시작, 두 번째 토큰(범위 입력)이 있으면 종료.
  const timeMatches = [...rest.matchAll(TIME_RE)];
  if (timeMatches.length === 0) return { ok: false, error: ERROR_NEED_TIME };

  const startMinute = toMinute(timeMatches[0]);
  if (startMinute === null) return { ok: false, error: ERROR_NEED_DATE_TIME };

  let endMinute: number | undefined;
  if (timeMatches.length >= 2) {
    const parsedEnd = toMinute(timeMatches[1]);
    // 시작보다 빠른 종료는 범위로 보지 않고 무시한다(회의 길이 기준으로 대체).
    if (parsedEnd !== null && parsedEnd > startMinute) endMinute = parsedEnd;
  }

  // 3) 연도 추론 + 회의 기간 검증.
  const candidateYears =
    year !== null
      ? [year]
      : [...new Set([Number(rangeStart.slice(0, 4)), Number(rangeEnd.slice(0, 4))])];

  let date: string | null = null;
  for (const y of candidateYears) {
    const ds = `${y}-${pad2(month)}-${pad2(day)}`;
    if (ds >= rangeStart && ds <= rangeEnd) {
      date = ds;
      break;
    }
  }
  if (!date) return { ok: false, error: ERROR_OUT_OF_RANGE };

  return { ok: true, date, startMinute, endMinute };
}
