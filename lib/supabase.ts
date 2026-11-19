import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 서버 전용 Supabase 클라이언트. 요청의 로그인 쿠키를 실어 보내므로 RLS가 계정 단위로 걸린다.
// 요청마다 새로 만든다(@supabase/ssr 권장).
export async function db() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts가 맡는다.
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {}
      },
    },
  });
}

/** 검증된 로그인 사용자 id. 로그아웃 상태면 null. */
export async function currentUserId(supa?: Awaited<ReturnType<typeof db>>): Promise<string | null> {
  const { data } = await (supa ?? (await db())).auth.getClaims();
  return (data?.claims.sub as string | undefined) ?? null;
}
