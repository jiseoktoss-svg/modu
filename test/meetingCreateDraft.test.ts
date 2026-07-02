import { describe, expect, it } from "vitest";
import {
  MEETING_CREATE_DRAFT_STORAGE_KEY,
  readMeetingCreateDraft,
  writeMeetingCreateDraft,
} from "@/components/meeting/meetingCreateDraft";

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

describe("meeting create draft storage", () => {
  it("회의 확인 화면 상태까지 임시 저장하고 복원한다", () => {
    const storage = new MemoryStorage();

    writeMeetingCreateDraft(storage, {
      title: "주간 제품 회의",
      agenda: "출시 일정 정리",
      location: "Zoom",
      deadlineDate: "2026-07-10",
      responseDeadlineDate: "2026-07-08",
      responseDeadlineTime: "18:00",
      durationHours: "1",
      durationMinute: "30",
      participants: [{ name: "김모두", role: "PM", attendanceType: "required" }],
      step: 6,
      maxStep: 6,
      confirming: true,
    });

    const draft = readMeetingCreateDraft(storage);

    expect(draft).toMatchObject({
      title: "주간 제품 회의",
      agenda: "출시 일정 정리",
      location: "Zoom",
      deadlineDate: "2026-07-10",
      responseDeadlineDate: "2026-07-08",
      responseDeadlineTime: "18:00",
      durationHours: "1",
      durationMinute: "30",
      participants: [{ name: "김모두", role: "PM", attendanceType: "required" }],
      step: 6,
      maxStep: 6,
      confirming: true,
    });
  });

  it("깨진 임시 저장값은 복원하지 않고 삭제한다", () => {
    const storage = new MemoryStorage();
    storage.setItem(MEETING_CREATE_DRAFT_STORAGE_KEY, "{not-json");

    expect(readMeetingCreateDraft(storage)).toBeNull();
    expect(storage.getItem(MEETING_CREATE_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
