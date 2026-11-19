import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인 세션을 갱신하고, 인증 상태에 따라 화면을 나눈다.
// 로그아웃: 로그인 화면과 둘러보기만 열린다. 로그인: 로그인 화면과 둘러보기 대신 내 화면으로 보낸다.
const PUBLIC_PATHS = ["/login", "/browse"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet, headers) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims;
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);
  const target = !signedIn && !isPublic ? "/login" : signedIn && isPublic ? "/" : null;
  if (!target) return response;

  const redirect = NextResponse.redirect(new URL(target, request.url));
  response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  for (const h of ["cache-control", "expires", "pragma"]) {
    const v = response.headers.get(h);
    if (v) redirect.headers.set(h, v);
  }
  return redirect;
}

export const config = {
  // 정적 파일과 이미지에는 돌지 않는다. 서버 함수(POST)도 여기를 지나 세션이 갱신된다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
