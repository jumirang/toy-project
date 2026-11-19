import { SignOutIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";

import { signOut } from "./actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost"><SignOutIcon />로그아웃</Button>
    </form>
  );
}
