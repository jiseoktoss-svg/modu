export const CALENDAR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type CalendarMonth = {
  y: number;
  m: number;
};

export type CalendarEmptyCell = {
  kind: "empty";
  key: string;
};

export type CalendarDateCell = {
  kind: "date";
  key: string;
  date: string;
  day: number;
  weekday: number;
};

export type CalendarCell = CalendarEmptyCell | CalendarDateCell;

export function padDatePart(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatDateStr(y: number, m: number, d: number): string {
  return `${y}-${padDatePart(m)}-${padDatePart(d)}`;
}

export function parseDateStr(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

// tz 드리프트를 피하려 UTC 정수 기준으로 계산한다.
export function daysInCalendarMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function firstWeekdayOfCalendarMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
}

export function previousCalendarMonth(month: CalendarMonth): CalendarMonth {
  return month.m === 1 ? { y: month.y - 1, m: 12 } : { y: month.y, m: month.m - 1 };
}

export function nextCalendarMonth(month: CalendarMonth): CalendarMonth {
  return month.m === 12 ? { y: month.y + 1, m: 1 } : { y: month.y, m: month.m + 1 };
}

export function buildCalendarMonthCells(month: CalendarMonth): CalendarCell[] {
  const lead = firstWeekdayOfCalendarMonth(month.y, month.m);
  const daysIn = daysInCalendarMonth(month.y, month.m);
  const cells: CalendarCell[] = [];

  for (let i = 0; i < lead; i += 1) {
    cells.push({ kind: "empty", key: `empty-${i}` });
  }

  for (let day = 1; day <= daysIn; day += 1) {
    const date = formatDateStr(month.y, month.m, day);
    cells.push({
      kind: "date",
      key: date,
      date,
      day,
      weekday: new Date(Date.UTC(month.y, month.m - 1, day)).getUTCDay(),
    });
  }

  return cells;
}

export function getCalendarMonthsWithDates(dates: string[]): CalendarMonth[] {
  const map = new Map<string, CalendarMonth>();

  for (const date of dates) {
    const { y, m } = parseDateStr(date);
    map.set(`${y}-${m}`, { y, m });
  }

  return Array.from(map.values()).sort((a, b) => a.y - b.y || a.m - b.m);
}

export function formatKoreanDateLabel(dateStr: string): string {
  const { y, m, d } = parseDateStr(dateStr);
  const weekday = CALENDAR_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 ${weekday}요일`;
}

export function formatMonthDay(dateStr: string): string {
  const { m, d } = parseDateStr(dateStr);
  return `${m}/${d}`;
}
