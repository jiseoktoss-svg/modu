// 디버그용 페이지 번호 뱃지. 어떤 화면을 말하는지 소통하기 위한 임시 표시로,
// 릴리스 전에 통째로 삭제한다(이 파일 + 각 화면의 <DebugPageTag> 호출).
//
// 번호 지도:
//  1 랜딩(/)                     2 회의 만들기(/meetings/new)
//  3 링크 공유(/meetings/[id]/share)
//  4 회의 안내(intro)            5 본인 확인(identity)
//  6 가능 시간(availability)     7 입력 확인(review)
//  8 응답 완료(waiting)          9 추천 시간(result)
// 10 회의 캘린더(done)          11 확정된 회의(/meetings/[id]/confirmed)
// 12 확정 안내(/m/[id] — 이미 확정된 회의로 진입했을 때)
export function DebugPageTag({ no, label }: { no: number; label: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-2 top-2.5 z-[100] select-none rounded-full bg-slate-900/75 px-2.5 py-1 text-[11px] font-bold leading-none text-white"
    >
      {no} · {label}
    </div>
  );
}
