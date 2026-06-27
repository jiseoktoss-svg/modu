// 가벼운 className 결합 유틸 (clsx 대체).
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
