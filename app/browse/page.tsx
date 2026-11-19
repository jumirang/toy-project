import { loadDashboard } from "@/features/dashboard/load";

import { BrowseView } from "./browse-view";

// 가입 없이 둘러보기: 기본 기업 둘의 공통 데이터를 읽기 전용으로 보여 준다.
export default async function BrowsePage() {
  const data = await loadDashboard("guest");
  return <BrowseView data={data} />;
}
