import { SignOutButton } from "@/features/account/sign-out-button";
import { Dashboard } from "@/features/dashboard/dashboard";
import { loadDashboard } from "@/features/dashboard/load";

// 로그인한 계정의 화면. 로그아웃 상태는 proxy.ts가 로그인 화면으로 보낸다.
export default async function Home() {
  const data = await loadDashboard("account");
  return <Dashboard data={data} today={data.today} account={<SignOutButton />} />;
}
