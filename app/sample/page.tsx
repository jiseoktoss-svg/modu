import { SiteHeader } from "@/components/layout/SiteHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { SampleStartButton } from "@/components/meeting/SampleStartButton";

export default function SamplePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
        <Card className="space-y-5 text-center">
          <CardTitle className="text-xl">샘플 회의 체험하기</CardTitle>
          <p className="text-sm leading-relaxed text-slate-600">
            동료 6명의 응답이 들어간 샘플 회의를 만들고, 주최자 결과 화면으로 바로 이동해요.
          </p>
          <div className="flex justify-center">
            <SampleStartButton />
          </div>
        </Card>
      </main>
    </div>
  );
}
