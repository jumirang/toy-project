"use client";
// 로그인 화면: 이메일/비밀번호로 로그인하거나 가입하고, 가입 없이 둘러볼 수도 있다.
import Link from "next/link";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { authenticate, type AuthState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate, { error: null, email: "" });
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">실적 캘린더</CardTitle>
        <CardDescription>로그인하면 내 관심 기업의 실적 발표일과 판단 재료를 한 화면에서 봅니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <FieldGroup>
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor="email">이메일</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">비밀번호</FieldLabel>
              <Input id="password" name="password" type="password" autoComplete="current-password" minLength={6} required />
            </Field>
            <Field>
              <Button type="submit" name="intent" value="login" disabled={pending}>로그인</Button>
              <Button type="submit" name="intent" value="signup" variant="outline" disabled={pending}>가입</Button>
            </Field>
            <FieldSeparator>또는</FieldSeparator>
            <Field>
              <Button variant="ghost" nativeButton={false} render={<Link href="/browse" />}>가입 없이 둘러보기</Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
