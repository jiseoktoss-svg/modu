import { cn } from "@/lib/cn";

export type AttendanceType = "required" | "optional";

// '필수'/'선택' 참석 유형 태그(작은 pill). 이름 벳지 안이나 명단 칩 안에 붙인다.
export function RoleTag({
  attendanceType,
  className,
}: {
  attendanceType: AttendanceType;
  className?: string;
}) {
  const isRequired = attendanceType === "required";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold sm:px-2 sm:text-[11px]",
        isRequired
          ? "bg-brand-500 text-white shadow-sm shadow-brand-500/20"
          : "bg-slate-300 text-slate-600",
        className,
      )}
    >
      {isRequired ? "필수" : "선택"}
    </span>
  );
}

// 참석자 이름 벳지 — 이름 앞에 '필수'/'선택' 태그를 붙인 pill.
// 추천안 문장(인라인)에서 이름을 벳지로 노출할 때 쓴다. 캘린더 명단 칩은 NameGroup 이 담당.
export function AttendeeNameBadge({
  name,
  attendanceType,
  className,
}: {
  name: string;
  attendanceType: AttendanceType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mx-0.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 align-middle text-[13px] font-semibold text-slate-700",
        className,
      )}
    >
      <RoleTag attendanceType={attendanceType} />
      {name}
    </span>
  );
}
