// 한 기업 갱신을 진행 단계와 함께 스트리밍한다. 한 줄에 하나씩: "stage:<문구>", 마지막에 "done" 또는 "error:<이유>".
// 공통 데이터를 쓰므로 로그인한 사용자만 부를 수 있다(docs/decisions/data-ownership.md).
import { refreshCompany } from "@/features/refresh/refresh-company";
import { currentUserId, db } from "@/lib/supabase";

export async function POST(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supa = await db();
  if (!(await currentUserId(supa))) return new Response("error:로그인이 필요합니다.\n", { status: 401 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: string) => controller.enqueue(enc.encode(`${line}\n`));
      try {
        await refreshCompany(supa, code, (stage) => send(`stage:${stage}`));
        send("done");
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await supa.from("companies").update({ refresh_error: error }).eq("stock_code", code);
        send(`error:${error}`);
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
