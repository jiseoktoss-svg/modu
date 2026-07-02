import { kstWallToIso } from "@/lib/time";
import type { AvailabilityStatus, CellStatus } from "@/lib/types";

// 시간표 그리드 -> availability 블록 변환 (순수 함수).
// 셀 키는 `${dateIndex}|${minute}` 형식이고, 한 셀은 [minute, minute+30) 30분 구간이다.
// 'available' 셀은 저장하지 않는다(키가 없으면 가능).

export const GRID_STEP_MINUTES = 30;

export interface GridBlock {
  startAt: string;
  endAt: string;
  status: AvailabilityStatus;
}

export function cellKey(dateIndex: number, minute: number): string {
  return `${dateIndex}|${minute}`;
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

