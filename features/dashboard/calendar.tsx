"use client";
// 월간 실적 발표 캘린더와 그 달의 발표 목록.
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { label } from "@/features/earnings/period";
import { cn } from "@/lib/utils";

import { md } from "./format";

export type CalEvent = { code: string; name: string; period: string; date: string; status: "past" | "confirmed" | "expected" };

const STATUS_TEXT = { past: "발표 완료", confirmed: "확정", expected: "예상" } as const;

export function StatusBadge({ status }: { status: CalEvent["status"] }) {
  if (status === "past") return <Badge variant="outline">{STATUS_TEXT.past}</Badge>;
  if (status === "confirmed") return <Badge>{STATUS_TEXT.confirmed}</Badge>;
  return <Badge variant="outline" className="border-dashed text-muted-foreground">{STATUS_TEXT.expected}</Badge>;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function EarningsCalendar(props: {
  month: [number, number];
  onMonth: (m: [number, number]) => void;
  events: CalEvent[];
  today: string;
  selected: { code: string; period: string } | null;
  onSelect: (e: CalEvent) => void;
}) {
  const [y, m] = props.month;
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const isSel = (e: CalEvent) => props.selected?.code === e.code && props.selected?.period === e.period;
  const monthEvents = props.events
    .filter((e) => e.date.startsWith(`${y}-${String(m + 1).padStart(2, "0")}`))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" aria-label="이전 달" onClick={() => props.onMonth(m === 0 ? [y - 1, 11] : [y, m - 1])}><CaretLeftIcon /></Button>
        <h2 className="text-base font-semibold tabular-nums">{y}년 {m + 1}월</h2>
        <Button variant="ghost" size="icon-sm" aria-label="다음 달" onClick={() => props.onMonth(m === 11 ? [y + 1, 0] : [y, m + 1])}><CaretRightIcon /></Button>
      </div>
      <div className="grid grid-cols-7 border-t border-l text-xs">
        {"일월화수목금토".split("").map((d) => (
          <div key={d} className="border-r border-b bg-muted py-1 text-center text-muted-foreground">{d}</div>
        ))}
        {days.map((d) => {
          const date = iso(d);
          const evs = props.events.filter((e) => e.date === date);
          return (
            <div key={date} className={cn("min-h-11 border-r border-b p-1 sm:min-h-[74px]", d.getMonth() !== m && "bg-muted/60 [&>span]:opacity-40")}>
              <span className={cn("inline-block text-[11px] tabular-nums", date === props.today && "rounded-full bg-foreground px-1.5 text-background")}>{d.getDate()}</span>
              <div className="hidden sm:block">
                {evs.map((e) => (
                  <button
                    key={e.code + e.period}
                    type="button"
                    title={`${e.name} ${label(e.period)} 실적 발표 (${STATUS_TEXT[e.status]})`}
                    onClick={() => props.onSelect(e)}
                    className={cn(
                      "mt-0.5 block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight",
                      e.status === "past" && "border-transparent bg-primary/15",
                      e.status === "confirmed" && "border-primary bg-background text-primary",
                      e.status === "expected" && "border-dashed border-muted-foreground bg-background text-muted-foreground",
                      isSel(e) && "ring-2 ring-ring ring-offset-1",
                    )}
                  >
                    {e.status === "expected" ? "예상 · " : ""}{e.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {evs.map((e) => (
                  <span key={e.code + e.period} className={cn("size-1.5 rounded-full", e.status === "expected" ? "border border-dashed border-muted-foreground" : "bg-primary")} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-3.5 rounded-sm bg-primary/15" />발표 완료</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-3.5 rounded-sm border border-primary" />예정(IR 공시로 확정)</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-3.5 rounded-sm border border-dashed border-muted-foreground" />예상(작년 같은 분기 기준)</span>
      </div>
      <div className="my-3.5 h-px bg-border" />
      <h3 className="mb-1.5 text-sm font-semibold text-muted-foreground">{m + 1}월 발표 {monthEvents.length}건</h3>
      {monthEvents.length === 0 && <p className="px-2 text-sm text-muted-foreground">이 달에는 관심 기업의 발표가 없습니다.</p>}
      <div className="grid gap-0.5">
        {monthEvents.map((e) => (
          <button
            key={e.code + e.period}
            type="button"
            onClick={() => props.onSelect(e)}
            className={cn("grid grid-cols-[72px_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm whitespace-nowrap hover:bg-muted", isSel(e) && "bg-primary/10")}
          >
            <span className="text-muted-foreground tabular-nums">{md(e.date)}</span>
            <span className="truncate"><b>{e.name}</b> <span className="text-muted-foreground">{label(e.period)}</span></span>
            <StatusBadge status={e.status} />
          </button>
        ))}
      </div>
    </div>
  );
}
