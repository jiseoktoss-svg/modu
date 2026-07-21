import { cn } from "@/lib/cn";

// 개인정보 안내: 회의 데이터는 expiresAt 이후 삭제될 수 있음을 주요 화면에 표시한다.
export function ExpiryNotice({ className }: { className?: string }) {
  return (
    <p className={cn("text-center text-xs text-slate-400", className)}>
      일정 정보는 만료일 이후 삭제될 수 있어요.
    </p>
  );
}
