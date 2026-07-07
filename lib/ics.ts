import { formatIcsUtc } from "@/lib/time";
import type { ConfirmedSlot, Meeting } from "@/lib/types";

// 외부 라이브러리 없이 최소 VEVENT 를 생성한다. 시각은 UTC(Z) 로 출력한다.

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function buildIcs(meeting: Meeting, slot: ConfirmedSlot): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MOA//meeting scheduler//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${slot.id}@moa`,
    `DTSTAMP:${formatIcsUtc(slot.createdAt)}`,
    `DTSTART:${formatIcsUtc(slot.startAt)}`,
    `DTEND:${formatIcsUtc(slot.endAt)}`,
    `SUMMARY:${escapeText(meeting.title)}`,
    ...(meeting.location ? [`LOCATION:${escapeText(meeting.location)}`] : []),
    `DESCRIPTION:${escapeText(slot.summaryText)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
