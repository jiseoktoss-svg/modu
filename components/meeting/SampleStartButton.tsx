"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { createSampleMeeting } from "@/app/actions/meetings";
import { Button } from "@/components/ui/Button";

export function SampleStartButton() {
  const [loading, setLoading] = useState(false);

  function start() {
    setLoading(true);
    // 성공 시 서버 액션이 admin 결과 화면으로 redirect 한다.
    void createSampleMeeting().catch(() => setLoading(false));
  }

  return (
    <Button size="lg" onClick={start} disabled={loading}>
      <Sparkles size={18} />
      {loading ? "샘플 만드는 중…" : "샘플 회의 만들고 결과 보기"}
    </Button>
  );
}
