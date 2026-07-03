import { SiteHeader } from "@/components/layout/SiteHeader";
import { StartMeetingButton } from "@/components/meeting/StartMeetingButton";
import { Reveal } from "@/components/landing/Reveal";
import {
  ConfirmClay,
  InviteClay,
  TimeClay,
} from "@/components/landing/LandingIllustrations";

// 랜딩: 문구|이미지 → 이미지|문구 → 문구|이미지 3단 구성.
// 회의 만들기는 모든 화면에서 하단 고정 CTA 로 노출한다(CTA 아래에는 아무것도 두지 않음).
export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-white/95">
      <SiteHeader mobileLogo />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-40 sm:px-6 sm:pb-44">
        {/* 1. 문구 | 이미지 */}
        <section className="grid items-center gap-6 pt-10 sm:grid-cols-2 sm:gap-10 sm:pt-16">
          <Reveal>
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                링크 하나로
                <br />
                회의를 시작해요
              </h2>
              <p className="mt-3 break-keep text-sm leading-relaxed text-slate-500 sm:text-base">
                회의를 만들면 바로 링크가 생겨요. 함께할 분들에게 보내기만 하면
                준비는 끝나요.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <InviteClay />
          </Reveal>
        </section>

        {/* 2. 이미지 | 문구 */}
        <section className="mt-20 grid items-center gap-6 sm:mt-28 sm:grid-cols-2 sm:gap-10">
          <Reveal delay={120}>
            <TimeClay />
          </Reveal>
          <Reveal>
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                어려운 시간만
                <br />
                알려주면 돼요
              </h2>
              <p className="mt-3 break-keep text-sm leading-relaxed text-slate-500 sm:text-base">
                빈 시간을 하나하나 고르지 않아도 괜찮아요. 힘든 날과 시간만
                짚어주면, 모두가 되는 시간은 modu가 찾아드려요.
              </p>
            </div>
          </Reveal>
        </section>

        {/* 3. 문구 | 이미지 */}
        <section className="mt-20 grid items-center gap-6 sm:mt-28 sm:grid-cols-2 sm:gap-10">
          <Reveal>
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                가장 나은 시간을
                <br />
                찾아드려요
              </h2>
              <p className="mt-3 break-keep text-sm leading-relaxed text-slate-500 sm:text-base">
                모두가 답하면 modu가 응답을 해석해서 가장 나은 시간을
                알려드려요. 모두가 참석할 수 있으면 회의는 저절로 정해져요.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <ConfirmClay />
          </Reveal>
        </section>
      </main>

      {/* 하단 고정 CTA — PC·모바일 공통. 위쪽은 흰색 그라데이션으로 본문과 잇는다. */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-white px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-full h-6 bg-gradient-to-b from-white/0 to-white"
        />
        {/* 다른 페이지 CTA 와 같은 폭: 본문 컬럼(max-w-2xl + sm:px-6)에 맞춘다 */}
        <div className="mx-auto w-full max-w-2xl sm:px-6">
          <p className="mb-2 text-center text-xs font-medium text-slate-400">
            지금은 데모로 열려 있어요 — 마음껏 눌러보세요
          </p>
          <StartMeetingButton display="block" />
        </div>
      </div>
    </div>
  );
}
