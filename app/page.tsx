import { SiteHeader } from "@/components/layout/SiteHeader";
import { LandingIntro } from "@/components/landing/LandingIntro";

// 랜딩: 인트로 모션(3장면) 재생 후 하단 고정 CTA(회의 만들기)가 노출된다.
// 재생·건너뛰기·재방문 스킵·CTA 게이팅은 LandingIntro 가 담당한다.
export default function LandingPage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white/95">
      <SiteHeader mobileLogo />
      <LandingIntro />
    </div>
  );
}
