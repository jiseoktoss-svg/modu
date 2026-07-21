"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { Emoji } from "@/components/ui/Emoji";

interface Props {
  meetingId: string;
}

export function ShareLinksPanel({ meetingId }: Props) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const participantPath = `/m/${meetingId}`;
  const participantUrl = `${origin}${participantPath}`;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Emoji symbol="🔗" size={18} />
        <CardTitle>참여자 링크</CardTitle>
      </div>
      <div className="break-all rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
        {participantUrl || participantPath}
      </div>
      <CopyButton value={participantUrl} label="참여자 링크 복사" />
    </Card>
  );
}
