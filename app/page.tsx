import { Dashboard } from "@/features/dashboard/dashboard";
import { loadDashboard } from "@/features/dashboard/load";

export default async function Home() {
  const data = await loadDashboard();
  return <Dashboard data={data} today={data.today} />;
}
