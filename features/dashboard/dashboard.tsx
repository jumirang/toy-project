"use client";
// 실적 캘린더 한 화면: 상단(갱신, 관심 기업), 캘린더, 상세.
import { ArrowsClockwiseIcon, StarIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { finishRefresh, refreshOne } from "@/app/actions";
import { cn } from "@/lib/utils";

import { EarningsCalendar, type CalEvent } from "./calendar";
import { EarningsDetail } from "./earnings-detail";
import type { DashboardData } from "./load";
import { RefreshButton } from "./refresh-button";
import { WatchlistDialog } from "./watchlist-dialog";
import { WriteGuardProvider } from "./write-guard";

const stamp = (iso: string | null) => {
  if (!iso) return "아직 없음";
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * readOnly: 둘러보기. 쓰기 동작의 입구를 누르면 onBlocked를 부른다.
 * account: 상단 오른쪽에 붙일 계정 동작(로그아웃, 가입 등). notice: 상단 안내.
 */
export function Dashboard({ data, today, readOnly = false, onBlocked = () => {}, account, notice }: {
  data: DashboardData; today: string; readOnly?: boolean; onBlocked?: () => void; account?: ReactNode; notice?: ReactNode;
}) {
  const router = useRouter();
  const { companies } = data;
  const [filter, setFilter] = useState<string | null>(null);
  const [month, setMonth] = useState<[number, number]>([Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<{ code: string; name: string; error: string }[]>([]);
  const [wlOpen, setWlOpen] = useState(false);

  const events: CalEvent[] = useMemo(
    () => companies.flatMap((c) => c.earnings.filter((e) => e.announcedOn).map((e) => ({ code: c.stockCode, name: c.name, period: e.period, date: e.announcedOn!, status: e.status }))),
    [companies],
  );
  const shown = events.filter((e) => !filter || e.code === filter);
  const latestPast = [...events].filter((e) => e.status === "past").sort((a, b) => b.date.localeCompare(a.date))[0];
  const [picked, setSelected] = useState<{ code: string; period: string } | null>(null);
  const selected = picked ?? (latestPast ? { code: latestPast.code, period: latestPast.period } : null);

  /** 기업을 고르면 그 기업만 보이고, 캘린더는 가장 최근 발표가 있는 달로 옮겨 그 발표를 바로 연다. */
  function pickCompany(code: string | null) {
    setFilter(code);
    if (!code) return;
    const latest = events.filter((e) => e.code === code && e.status === "past").sort((a, b) => b.date.localeCompare(a.date))[0]
      ?? events.filter((e) => e.code === code).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!latest) return;
    setMonth([Number(latest.date.slice(0, 4)), Number(latest.date.slice(5, 7)) - 1]);
    setSelected({ code, period: latest.period });
  }

  const selCompany = companies.find((c) => c.stockCode === selected?.code);
  const selEarning = selCompany?.earnings.find((e) => e.period === selected?.period);

  async function refresh(codes: string[]) {
    setProgress({ done: 0, total: codes.length });
    const failed: typeof failures = [];
    for (const [i, code] of codes.entries()) {
      const r = await refreshOne(code);
      if (!r.ok) failed.push({ code, name: companies.find((c) => c.stockCode === code)?.name ?? code, error: r.error });
      setProgress({ done: i + 1, total: codes.length });
    }
    await finishRefresh();
    setFailures(failed);
    setProgress(null);
    router.refresh();
  }

  const guard = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => (readOnly ? onBlocked() : fn(...args));

  return (
    <WriteGuardProvider value={{ readOnly, onBlocked }}>
    <main className="mx-auto w-full max-w-[1200px] px-4 py-4">
      {notice}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">실적 캘린더</h1>
          <p className="text-xs text-muted-foreground">
            {readOnly ? "둘러보기 · 기본 기업" : "관심 기업"} {companies.length}개 · 마지막 갱신 <span className="tabular-nums">{stamp(data.refreshedAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {readOnly ? (
            <Button variant="outline" onClick={onBlocked}><StarIcon weight="fill" />관심 기업 관리</Button>
          ) : (
            <WatchlistDialog companies={companies} open={wlOpen} onOpenChange={setWlOpen} disabled={!!progress} />
          )}
          <Button disabled={!!progress || companies.length === 0} onClick={guard(() => refresh(companies.map((c) => c.stockCode)))}>
            <ArrowsClockwiseIcon className={cn(progress && "animate-spin")} />
            {progress ? `갱신 중 ${progress.done}/${progress.total}` : "전체 갱신"}
          </Button>
          {account}
        </div>
      </div>

      {failures.length > 0 && !progress && (
        <Alert variant="destructive" className="mb-3.5">
          <AlertTitle>{failures.length}개 기업을 갱신하지 못했습니다.</AlertTitle>
          <AlertDescription>
            <ul>{failures.map((f) => <li key={f.code}>{f.name}: {f.error}</li>)}</ul>
            <p>나머지는 갱신했고, 실패한 기업은 이전 데이터를 보여 줍니다.</p>
            <Button size="sm" variant="outline" className="mt-1.5" onClick={() => refresh(failures.map((f) => f.code))}>실패한 기업만 다시 갱신</Button>
          </AlertDescription>
        </Alert>
      )}

      {companies.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <h2 className="text-base font-semibold">관심 기업이 없습니다</h2>
          <p className="mb-3 text-sm text-muted-foreground">기업을 추가하면 실적 발표일이 캘린더에 표시됩니다.</p>
          <Button onClick={guard(() => setWlOpen(true))}>관심 기업 추가</Button>
        </CardContent></Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <Card><CardContent>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[{ stockCode: null as string | null, name: "전체" }, ...companies].map((c) => (
                <button
                  key={c.stockCode ?? "all"}
                  type="button"
                  onClick={() => pickCompany(c.stockCode)}
                  className={cn("h-7 rounded-full border px-2.5 text-xs", filter === c.stockCode ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted")}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <EarningsCalendar month={month} onMonth={setMonth} events={shown} today={today} selected={selected} onSelect={(e) => setSelected({ code: e.code, period: e.period })} />
          </CardContent></Card>

          {selCompany && selEarning ? (
            <EarningsDetail
              key={`${selCompany.stockCode}-${selEarning.period}`} c={selCompany} e={selEarning}
              refresh={<RefreshButton code={selCompany.stockCode} name={selCompany.name} disabled={!!progress} />}
            />
          ) : (
            <Card><CardContent className="py-12 text-center">
              <h2 className="text-base font-semibold">발표일을 고르세요</h2>
              <p className="text-sm text-muted-foreground">
                {events.length ? "캘린더에서 기업 발표를 누르면 실적과 컨센서스, 주가 반응을 보여 줍니다." : "아직 데이터가 없습니다. 전체 갱신을 눌러 실적과 주가를 가져오세요."}
              </p>
            </CardContent></Card>
          )}
        </div>
      )}

      <footer className="mt-6 border-t pt-3 text-xs text-muted-foreground">
        <ul className="list-disc space-y-1 pl-4">
          <li>컨센서스는 실적 발표일 전후 뉴스 기사에서 인용한 값입니다. 에프앤가이드 등 유료 컨센서스 데이터와 연동하지 않아 실제 값과 다를 수 있습니다.</li>
          <li>PER·PBR 밴드는 DART 공시의 연결 재무 수치로 직접 계산한 값이라 정확하지 않을 수 있습니다.</li>
        </ul>
      </footer>
    </main>
    </WriteGuardProvider>
  );
}
