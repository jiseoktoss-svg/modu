import { getKstParts, kstWallToIso, parseHm } from "@/lib/time";
import type { AvailabilityStatus, CellStatus } from "@/lib/types";

// 시간표 그리드 <-> availability 블록 변환 (순수 함수).
// 셀 키는 `${dateIndex}|${minute}` 형식이고, 한 셀은 [minute, minute+30) 30분 구간이다.
// 'available' 셀은 저장하지 않는다(키가 없으면 가능).

export const GRID_STEP_MINUTES = 30;

export interface GridBlock {
  startAt: string;
  endAt: string;
  status: AvailabilityStatus;
}

export type DateStatus = "available" | "busy" | "preferred";

export function cellKey(dateIndex: number, minute: number): string {
  return `${dateIndex}|${minute}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** 그리드 상태를 저장용 블록으로 변환한다. 같은 날·같은 상태의 연속 셀은 한 블록으로 병합한다. */
export function cellsToBlocks(
  cells: Record<string, CellStatus>,
  dates: string[],
): GridBlock[] {
  const byDate = new Map<number, { minute: number; status: AvailabilityStatus }[]>();

  for (const [key, status] of Object.entries(cells)) {
    if (status === "available") continue;
    const [diStr, mStr] = key.split("|");
    const dateIndex = Number(diStr);
    const minute = Number(mStr);
    if (!Number.isInteger(dateIndex) || dateIndex < 0 || dateIndex >= dates.length) continue;
    const list = byDate.get(dateIndex) ?? [];
    list.push({ minute, status });
    byDate.set(dateIndex, list);
  }

  const blocks: GridBlock[] = [];
  for (const [dateIndex, entries] of byDate) {
    entries.sort((a, b) => a.minute - b.minute);
    let i = 0;
    while (i < entries.length) {
      const start = entries[i];
      let endMinute = start.minute + GRID_STEP_MINUTES;
      let j = i + 1;
      while (
        j < entries.length &&
        entries[j].status === start.status &&
        entries[j].minute === endMinute
      ) {
        endMinute += GRID_STEP_MINUTES;
        j += 1;
      }
      blocks.push({
        startAt: kstWallToIso(dates[dateIndex], start.minute),
        endAt: kstWallToIso(dates[dateIndex], endMinute),
        status: start.status,
      });
      i = j;
    }
  }
  return blocks;
}

/** 저장된 블록을 그리드 셀 상태로 되돌린다. */
export function blocksToCells(
  blocks: Array<{ startAt: string; endAt: string; status: AvailabilityStatus }>,
  dates: string[],
): Record<string, CellStatus> {
  const dateIndexByStr = new Map<string, number>();
  dates.forEach((d, i) => dateIndexByStr.set(d, i));

  const cells: Record<string, CellStatus> = {};
  for (const b of blocks) {
    const ps = getKstParts(b.startAt);
    const dateStr = `${ps.year}-${pad2(ps.month)}-${pad2(ps.day)}`;
    const dateIndex = dateIndexByStr.get(dateStr);
    if (dateIndex === undefined) continue;

    const startMinute = ps.hours * 60 + ps.minutes;
    const pe = getKstParts(b.endAt);
    const endMinute = pe.hours * 60 + pe.minutes;
    for (let m = startMinute; m < endMinute; m += GRID_STEP_MINUTES) {
      cells[cellKey(dateIndex, m)] = b.status;
    }
  }
  return cells;
}

function blockDateStr(iso: string): string {
  const p = getKstParts(iso);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function maybePushBlock(blocks: GridBlock[], date: string, start: number, end: number, status: DateStatus) {
  if (status === "available" || !(start < end)) return;
  blocks.push({
    startAt: kstWallToIso(date, start),
    endAt: kstWallToIso(date, end),
    status,
  });
}

/** 날짜 단위 응답을 저장용 블록으로 변환한다. 저장하지 않은 날짜는 가능으로 본다. */
export function dateStatusesToBlocks(
  statuses: Record<string, DateStatus>,
  dates: string[],
  workdayStart: string,
  workdayEnd: string,
  lunchStart: string,
  lunchEnd: string,
): GridBlock[] {
  const workStart = parseHm(workdayStart);
  const workEnd = parseHm(workdayEnd);
  const lunchS = parseHm(lunchStart);
  const lunchE = parseHm(lunchEnd);
  const hasLunchBreak = workStart < lunchS && lunchE < workEnd;

  const blocks: GridBlock[] = [];
  for (const date of dates) {
    const status = statuses[date] ?? "available";
    if (hasLunchBreak) {
      maybePushBlock(blocks, date, workStart, lunchS, status);
      maybePushBlock(blocks, date, lunchE, workEnd, status);
    } else {
      maybePushBlock(blocks, date, workStart, workEnd, status);
    }
  }
  return blocks;
}

/** 저장된 시간 블록을 날짜 단위 응답으로 되돌린다. 불가능이 선호보다 우선한다. */
export function blocksToDateStatuses(
  blocks: Array<{ startAt: string; endAt: string; status: AvailabilityStatus }>,
  dates: string[],
): Record<string, DateStatus> {
  const allowedDates = new Set(dates);
  const statuses: Record<string, DateStatus> = {};

  for (const block of blocks) {
    if (block.status === "avoid") continue;
    const date = blockDateStr(block.startAt);
    if (!allowedDates.has(date)) continue;
    if (block.status === "busy") {
      statuses[date] = "busy";
    } else if (block.status === "preferred" && statuses[date] !== "busy") {
      statuses[date] = "preferred";
    }
  }

  return statuses;
}
