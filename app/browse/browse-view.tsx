"use client";
// 둘러보기 조합: 읽기 전용 대시보드 + 가입 안내.
import Link from "next/link";
import { useState } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SignupPrompt } from "@/features/account/signup-prompt";
import { Dashboard } from "@/features/dashboard/dashboard";
import type { DashboardData } from "@/features/dashboard/load";

export function BrowseView({ data }: { data: DashboardData }) {
  const [prompt, setPrompt] = useState(false);
  return (
    <>
      <Dashboard
        data={data}
        today={data.today}
        readOnly
        onBlocked={() => setPrompt(true)}
        notice={
          <Alert className="mb-3.5">
            <AlertTitle>둘러보는 중입니다</AlertTitle>
            <AlertDescription>삼성전자와 SK하이닉스만 읽기 전용으로 보입니다. 가입하면 내 관심 기업을 추가하고 값을 고칠 수 있습니다.</AlertDescription>
            <AlertAction>
              <Button size="sm" nativeButton={false} render={<Link href="/login" />}>가입·로그인</Button>
            </AlertAction>
          </Alert>
        }
      />
      <SignupPrompt open={prompt} onOpenChange={setPrompt} />
    </>
  );
}
