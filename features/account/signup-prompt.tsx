"use client";
// 둘러보기에서 쓰기 동작을 누르면 뜨는 가입 안내.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SignupPrompt({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>가입하면 쓸 수 있습니다</DialogTitle>
          <DialogDescription>
            둘러보기에서는 삼성전자와 SK하이닉스를 읽기만 할 수 있습니다. 가입하면 관심 기업을 추가하고, 컨센서스와 예정일을 고치고, 데이터를 갱신할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>계속 둘러보기</Button>
          <Button nativeButton={false} render={<Link href="/login" />}>가입·로그인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
