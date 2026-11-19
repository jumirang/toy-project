"use client";
// 상세 머리의 기업별 갱신 버튼. 서버가 보내는 단계 문구(예: DART 잠정실적 공시 읽는 중)를 그대로 보여 준다.
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useWriteGuard } from "./write-guard";

export function RefreshButton({ code, name, disabled }: { code: string; name: string; disabled?: boolean }) {
  const router = useRouter();
  const guard = useWriteGuard();
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setStage("갱신 시작");
    try {
      const res = await fetch(`/api/refresh/${code}`, { method: "POST" });
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines) {
          if (line.startsWith("stage:")) setStage(line.slice(6));
          else if (line.startsWith("error:")) setError(line.slice(6));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setStage(null);
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      {error && !stage && <span className="max-w-48 truncate text-xs text-destructive" title={error}>갱신 실패: {error}</span>}
      <Button size="xs" variant="outline" disabled={disabled || !!stage} onClick={guard(run)} aria-label={`${name} 갱신`}>
        <ArrowsClockwiseIcon className={cn(stage && "animate-spin")} />
        {stage ? `${stage}…` : "갱신"}
      </Button>
    </span>
  );
}
