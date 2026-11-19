"use server";
// 이메일/비밀번호 가입·로그인·로그아웃. 이메일 확인은 꺼 두어 가입하면 바로 로그인된다.
import { redirect } from "next/navigation";

import { db } from "@/lib/supabase";

export type AuthState = { error: string | null; email: string };

const MESSAGES: Record<string, string> = {
  invalid_credentials: "이메일 또는 비밀번호가 맞지 않습니다.",
  user_already_exists: "이미 가입된 이메일입니다. 로그인해 주세요.",
  email_exists: "이미 가입된 이메일입니다. 로그인해 주세요.",
  weak_password: "비밀번호는 6자 이상으로 정해 주세요.",
  email_address_invalid: "쓸 수 없는 이메일 주소입니다.",
  validation_failed: "이메일과 비밀번호를 확인해 주세요.",
};

export async function authenticate(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요.", email };

  const supa = await db();
  if (form.get("intent") === "signup") {
    const { data, error } = await supa.auth.signUp({ email, password });
    if (error) return { error: MESSAGES[error.code ?? ""] ?? error.message, email };
    // 이미 가입된 이메일이면 세션 없이 빈 사용자가 돌아오는 설정도 있다.
    if (!data.session) return { error: "가입을 마치지 못했습니다. 이미 가입된 이메일이면 로그인해 주세요.", email };
  } else {
    const { error } = await supa.auth.signInWithPassword({ email, password });
    if (error) return { error: MESSAGES[error.code ?? ""] ?? error.message, email };
  }
  redirect("/");
}

export async function signOut() {
  await (await db()).auth.signOut();
  redirect("/login");
}
