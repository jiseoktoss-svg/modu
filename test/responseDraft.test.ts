import { describe, expect, it } from "vitest";
import { readResponseDraft, writeResponseDraft } from "@/components/scheduler/responseDraft";

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length() {
    return this.items.size;
  }

  clear() {
    this.items.clear();
  }

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.items.delete(key);
  }

  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

describe("response draft storage", () => {
  it("응답 화면 단계와 입력값을 임시 저장하고 복원한다", () => {
    const storage = new MemoryStorage();

    writeResponseDraft(storage, {
      meetingId: "meeting-1",
      step: "review",
      caseId: 3,
      selectedId: "participant-1",
      token: "token-1",
      role: "PM",
      identityName: "김모두",
      identityRole: "PM",
      formStep: 1,
      maxFormStep: 1,
      availStep: 1,
      maxAvailStep: 1,
      busyDates: ["2026-07-10"],
      dateTimeBusy: {
        "2026-07-11": [{ start: 600, end: 660 }],
      },
      dtDate: "2026-07-11",
      draftStart: "10:00",
      draftEnd: "11:00",
      resultSelectedIndex: 1,
      resultVotedIndex: 2,
    });

    const draft = readResponseDraft(storage, "meeting-1");

    expect(draft).toMatchObject({
      meetingId: "meeting-1",
      step: "review",
      caseId: 3,
      selectedId: "participant-1",
      token: "token-1",
      role: "PM",
      identityName: "김모두",
      identityRole: "PM",
      formStep: 1,
      maxFormStep: 1,
      availStep: 1,
      maxAvailStep: 1,
      busyDates: ["2026-07-10"],
      dateTimeBusy: {
        "2026-07-11": [{ start: 600, end: 660 }],
      },
      dtDate: "2026-07-11",
      draftStart: "10:00",
      draftEnd: "11:00",
      resultSelectedIndex: 1,
      resultVotedIndex: 2,
    });
  });

  it("깨진 응답 임시 저장값은 복원하지 않고 삭제한다", () => {
    const storage = new MemoryStorage();
    storage.setItem("modu:response-draft:meeting-1:v1", "{not-json");

    expect(readResponseDraft(storage, "meeting-1")).toBeNull();
    expect(storage.getItem("modu:response-draft:meeting-1:v1")).toBeNull();
  });
});
