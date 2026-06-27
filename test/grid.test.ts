import { describe, expect, it } from "vitest";
import { blocksToDateStatuses, dateStatusesToBlocks } from "@/lib/grid";

describe("date availability conversion", () => {
  it("날짜 상태를 근무 시간 블록으로 변환한다", () => {
    const blocks = dateStatusesToBlocks(
      { "2026-07-01": "busy", "2026-07-02": "preferred" },
      ["2026-07-01", "2026-07-02", "2026-07-03"],
      "09:00",
      "18:00",
      "00:00",
      "00:01",
    );

    expect(blocks).toEqual([
      {
        startAt: "2026-07-01T09:00:00+09:00",
        endAt: "2026-07-01T18:00:00+09:00",
        status: "busy",
      },
      {
        startAt: "2026-07-02T09:00:00+09:00",
        endAt: "2026-07-02T18:00:00+09:00",
        status: "preferred",
      },
    ]);
  });

  it("점심 시간이 있는 기존 회의는 점심을 피해 블록을 나눈다", () => {
    const blocks = dateStatusesToBlocks(
      { "2026-07-01": "busy" },
      ["2026-07-01"],
      "09:00",
      "18:00",
      "12:00",
      "13:00",
    );

    expect(blocks).toEqual([
      {
        startAt: "2026-07-01T09:00:00+09:00",
        endAt: "2026-07-01T12:00:00+09:00",
        status: "busy",
      },
      {
        startAt: "2026-07-01T13:00:00+09:00",
        endAt: "2026-07-01T18:00:00+09:00",
        status: "busy",
      },
    ]);
  });

  it("저장 블록을 날짜 상태로 되돌린다", () => {
    const statuses = blocksToDateStatuses(
      [
        {
          startAt: "2026-07-01T09:00:00+09:00",
          endAt: "2026-07-01T18:00:00+09:00",
          status: "preferred",
        },
        {
          startAt: "2026-07-02T09:00:00+09:00",
          endAt: "2026-07-02T18:00:00+09:00",
          status: "busy",
        },
      ],
      ["2026-07-01", "2026-07-02"],
    );

    expect(statuses).toEqual({
      "2026-07-01": "preferred",
      "2026-07-02": "busy",
    });
  });
});
