"use client";
// 한 기업 갱신을 /api/refresh/[code]로 부르고, 서버가 보내는 단계 문구를 따라간다.
// 상세의 갱신 버튼과 관심 기업 추가 직후의 첫 갱신이 함께 쓴다.
import { useRouter } from "next/navigation";
import { useState } from "react";

export function useRefreshStream() {
  const router = useRouter();
  const [running, setRunning] = useState<{ code: string; stage: string } | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function refresh(code: string) {
    setError(null);
    setRunning({ code, stage: "갱신 시작" });
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
          if (line.startsWith("stage:")) setRunning({ code, stage: line.slice(6) });
          else if (line.startsWith("error:")) setError({ code, message: line.slice(6) });
        }
      }
    } catch (e) {
      setError({ code, message: e instanceof Error ? e.message : String(e) });
    }
    setRunning(null);
    router.refresh();
  }

  return { refresh, running, error };
}
