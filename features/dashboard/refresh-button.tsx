"use client";
// 상세 머리의 기업별 갱신 버튼. 서버가 보내는 단계 문구(예: DART 잠정실적 공시 읽는 중)를 그대로 보여 준다.
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useRefreshStream } from "./use-refresh-stream";
import { useWriteGuard } from "./write-guard";

export function RefreshButton({ code, name, disabled }: { code: string; name: string; disabled?: boolean }) {
  const guard = useWriteGuard();
  const { refresh, running, error } = useRefreshStream();
  const stage = running?.stage ?? null;

  return (
    <span className="flex items-center gap-2">
      {error && !stage && <span className="max-w-48 truncate text-xs text-destructive" title={error.message}>갱신 실패: {error.message}</span>}
      <Button size="xs" variant="outline" disabled={disabled || !!stage} onClick={guard(() => refresh(code))} aria-label={`${name} 갱신`}>
        <ArrowsClockwiseIcon className={cn(stage && "animate-spin")} />
        {stage ? `${stage}…` : "갱신"}
      </Button>
    </span>
  );
}
