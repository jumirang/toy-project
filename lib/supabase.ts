import { createClient } from "@supabase/supabase-js";

// 로그인 없는 임시 단계: 서버에서만 publishable 키로 접근한다 (supabase/migrations 참고).
export function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
}
