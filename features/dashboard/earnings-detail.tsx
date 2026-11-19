"use client";
// 고른 발표의 상세: 기업 정보, 실적과 컨센서스, 발표 후 주가, 과거 반응, 밴드, 뉴스.
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { saveAnnouncementDate, saveConsensus, saveDescription } from "@/app/actions";
import type { ConsensusItem } from "@/features/consensus/extract";
import { label } from "@/features/earnings/period";
import { surprisePct } from "@/features/earnings/preliminary";
import { priceChange } from "@/features/market/metrics";

import { BandChart } from "./band-chart";
import { StatusBadge } from "./calendar";
import { md, pct, tone, won, ymd } from "./format";
import { PriceSinceChart } from "./price-since-chart";
import type { CompanyView, Earning } from "./load";
import { REACTION_DAYS } from "./reaction-days";
import { useWriteGuard } from "./write-guard";

const ITEMS: [ConsensusItem, string, "revenue" | "opIncome" | "netIncome"][] = [
  ["rev", "매출액", "revenue"], ["op", "영업이익", "opIncome"], ["net", "순이익", "netIncome"],
];

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-sm text-primary hover:underline">
      {children}<ArrowSquareOutIcon className="size-3.5" />
    </a>
  );
}

const Section = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="border-t pt-3.5">
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

function ConsensusTable({ c, e }: { c: CompanyView; e: Earning }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const showActual = e.status === "past";
  const guard = useWriteGuard();

  const open = guard(() => {
    const d: Record<string, string> = {};
    for (const [k] of ITEMS) for (const f of ["avg", "min", "max"] as const) d[`${k}.${f}`] = e.consensus[k]?.[f]?.toString() ?? "";
    setDraft(d);
    setEditing(true);
  });
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));
  const save = () =>
    start(async () => {
      const values = Object.fromEntries(ITEMS.map(([k]) => [k, { avg: num(draft[`${k}.avg`]), min: num(draft[`${k}.min`]), max: num(draft[`${k}.max`]) }]));
      await saveConsensus(c.stockCode, e.period, values);
      setEditing(false);
    });
  const cell = (k: string, f: string) => (
    <Input
      className="h-7 w-24 text-right tabular-nums"
      inputMode="numeric"
      aria-label={`${k} ${f}`}
      value={draft[`${k}.${f}`] ?? ""}
      onChange={(ev) => setDraft({ ...draft, [`${k}.${f}`]: ev.target.value })}
    />
  );
  const articles = [...new Map(ITEMS.map(([k]) => e.consensus[k]).filter((x) => x?.article).map((x) => [x!.article!.url, x!])).values()];

  return (
    <Section
      title={`${label(e.period)} ${showActual ? "실적" : "컨센서스"} (연결, 억원)`}
      action={editing ? (
        <div className="flex gap-1.5">
          <Button size="xs" variant="outline" onClick={() => setEditing(false)} disabled={pending}>취소</Button>
          <Button size="xs" onClick={save} disabled={pending}>{pending ? "저장 중" : "저장"}</Button>
        </div>
      ) : <Button size="xs" variant="outline" onClick={open}>컨센서스 수정</Button>}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>항목</TableHead>
            {showActual && <TableHead className="text-right">실적</TableHead>}
            <TableHead className="text-right">컨센서스 평균</TableHead>
            {showActual && <TableHead className="text-right">차이</TableHead>}
            <TableHead className="text-right">최저</TableHead>
            <TableHead className="text-right">최고</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ITEMS.map(([k, name, field]) => {
            const cs = e.consensus[k];
            const diff = surprisePct(e[field], cs?.avg ?? null);
            return (
              <TableRow key={k}>
                <TableCell>{name}</TableCell>
                {showActual && <TableCell className="text-right tabular-nums">{won(e[field])}</TableCell>}
                <TableCell className="text-right tabular-nums">
                  {editing ? cell(k, "avg") : (
                    <>
                      {won(cs?.avg)}{" "}
                      {cs?.source && <span className="text-[11px] text-muted-foreground">{cs.source === "news" ? "뉴스" : "직접 수정"}</span>}
                      {cs?.avg == null && cs?.article && <a href={cs.article.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">관련 기사</a>}
                    </>
                  )}
                </TableCell>
                {showActual && <TableCell className={`text-right font-semibold tabular-nums ${tone(diff)}`}>{pct(diff)}</TableCell>}
                <TableCell className="text-right tabular-nums">{editing ? cell(k, "min") : won(cs?.min)}</TableCell>
                <TableCell className="text-right tabular-nums">{editing ? cell(k, "max") : won(cs?.max)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
        {articles.map((a) => (
          <div key={a.article!.url}>
            {a.source === "news" ? "컨센서스 평균 출처" : "관련 기사"}: <a className="underline" href={a.article!.url} target="_blank" rel="noopener noreferrer">{a.article!.title}</a>
            {a.article!.date && ` · ${md(a.article!.date.slice(0, 10))}`}
          </div>
        ))}
        <div>최저·최고는 직접 입력한 값입니다. 찾지 못한 평균은 비어 있으니 직접 입력해 주세요.</div>
      </div>
    </Section>
  );
}

function UpcomingCard({ c, e, basis }: { c: CompanyView; e: Earning; basis: Earning | undefined }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(e.announcedOn ?? "");
  const [pending, start] = useTransition();
  const guard = useWriteGuard();
  const lastYear = c.earnings.find((x) => x.period === `${Number(e.period.slice(0, 4)) - 1}${e.period.slice(4)}`)?.announcedOn;
  const reason =
    e.basis === "ir" ? "DART 기업설명회(IR) 개최 공시" :
    e.basis === "user" ? "직접 수정한 날짜" :
    `작년 같은 분기 발표일(${lastYear ? ymd(lastYear) : "—"}) 기준 추정. IR 개최 공시가 나오면 확정으로 바뀝니다.`;
  return (
    <div className="mb-3 rounded-xl bg-muted p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b>{label(e.period)} 실적 발표 {e.announcedOn ? md(e.announcedOn) : "—"} {e.status === "expected" ? "(예상)" : ""}</b>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input type="date" className="h-7 w-auto" value={date} onChange={(ev) => setDate(ev.target.value)} aria-label="예정일" />
            <Button size="xs" variant="outline" onClick={() => setEditing(false)}>취소</Button>
            <Button size="xs" disabled={!date || pending} onClick={() => start(async () => { await saveAnnouncementDate(c.stockCode, e.period, date); setEditing(false); })}>저장</Button>
          </div>
        ) : <Button size="xs" variant="outline" onClick={guard(() => setEditing(true))}>예정일 수정</Button>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">근거: {reason}</p>
      {basis && <p className="mt-0.5 text-xs text-muted-foreground">주가와 과거 반응은 직전 발표({label(basis.period)}, {basis.announcedOn ? md(basis.announcedOn) : "—"}) 기준입니다.</p>}
    </div>
  );
}

function Description({ c }: { c: CompanyView }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.description ?? "");
  const [pending, start] = useTransition();
  const guard = useWriteGuard();
  if (editing)
    return (
      <div className="my-2.5 space-y-1.5">
        <Textarea value={text} onChange={(ev) => setText(ev.target.value)} placeholder="어떤 사업을 하는 기업인지 한두 문장으로 적어 두세요." aria-label="기업 설명" />
        <div className="flex gap-1.5">
          <Button size="xs" variant="outline" onClick={() => setEditing(false)}>취소</Button>
          <Button size="xs" disabled={pending} onClick={() => start(async () => { await saveDescription(c.stockCode, text); setEditing(false); })}>저장</Button>
        </div>
      </div>
    );
  return (
    <p className="my-2.5 text-sm">
      {c.description ?? <span className="text-muted-foreground">기업 설명이 없습니다. 어떤 사업을 하는지 적어 두면 여기에 보입니다.</span>}{" "}
      <button type="button" className="text-xs text-primary hover:underline" onClick={guard(() => setEditing(true))}>{c.description ? "수정" : "설명 적기"}</button>
    </p>
  );
}

export function EarningsDetail({ c, e, refresh }: { c: CompanyView; e: Earning; refresh?: React.ReactNode }) {
  const [kind, setKind] = useState<"PER" | "PBR">("PER");
  const past = c.earnings.filter((x) => x.status === "past" && x.announcedOn).sort((a, b) => b.period.localeCompare(a.period));
  const basis = e.status === "past" ? e : past[0];
  const change = basis?.announcedOn ? priceChange(c.closes, basis.announcedOn) : null; // 항상 현재(가장 최근 거래일) 기준
  const opDiff = basis ? surprisePct(basis.opIncome, basis.consensus.op?.avg ?? null) : null;
  const band = kind === "PER" ? c.per : c.pbr;
  const lastClose = c.closes.at(-1);

  return (
    <Card>
      <CardContent className="space-y-3.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{c.name}</h2>
            <span className="text-sm text-muted-foreground tabular-nums">{c.stockCode}</span>
            <StatusBadge status={e.status} />
            <span className="ml-auto">{refresh}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {c.industry ?? "업종 정보 없음"} · {label(e.period)} · {e.announcedOn ? `${md(e.announcedOn)} 발표` : "발표일 미정"}
          </p>
          <Description key={c.stockCode} c={c} />
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {c.homepage && <Ext href={c.homepage}>공식 사이트</Ext>}
            {c.irUrl && <Ext href={c.irUrl}>IR</Ext>}
            <Ext href={`https://dart.fss.or.kr/dsab007/main.do?autoSearch=Y&textCrpNm=${encodeURIComponent(c.name)}`}>DART 공시</Ext>
            <Ext href={`https://finance.naver.com/item/main.naver?code=${c.stockCode}`}>네이버 증권</Ext>
            <Ext href={`https://comp.fnguide.com/SVO2/ASP/SVD_Main.asp?gicode=A${c.stockCode}`}>에프앤가이드</Ext>
          </div>
        </div>

        {e.status !== "past" && <UpcomingCard key={e.period} c={c} e={e} basis={basis} />}
        {e.status !== "past" && <ConsensusTable key={`u-${c.stockCode}-${e.period}`} c={c} e={e} />}

        {basis && (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Kpi label={`${label(basis.period)} 영업이익 컨센서스 대비`} value={pct(opDiff)} className={tone(opDiff)} />
              <Kpi label="발표 후 주가 변동" value={pct(change?.pct)} className={tone(change?.pct)} />
              <Kpi label={lastClose ? `종가 (${md(lastClose.date)})` : "종가"} value={lastClose ? `${won(lastClose.close)}원` : "—"} />
            </div>
            <ConsensusTable key={`p-${c.stockCode}-${basis.period}`} c={c} e={basis} />
            <Section title={`발표 후 주가 변동률 (${label(basis.period)} 발표 이후, 일별)`}>
              <PriceSinceChart key={`${c.stockCode}-${basis.period}`} closes={c.closes} announcedOn={basis.announcedOn!} />
            </Section>
          </>
        )}

        <Section title="과거 발표별 영업이익 컨센서스 대비와 주가 반응">
          <Table className="text-xs [&_td]:px-1.5 [&_th]:px-1.5">
            <TableHeader>
              <TableRow>
                <TableHead>분기</TableHead><TableHead className="text-right">발표일</TableHead><TableHead className="text-right">컨센서스 대비</TableHead>
                {REACTION_DAYS.map((d) => <TableHead key={d} className="text-right">+{d}일</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {past.slice(0, 8).map((x) => {
                const s = surprisePct(x.opIncome, x.consensus.op?.avg ?? null);
                const { base, cells } = x.reactions;
                const prevLine = base ? `발표 전날 종가 ${won(base.prevClose)}원 (${ymd(base.prevDate)})` : "주가 데이터 없음";
                return (
                  <TableRow key={x.period}>
                    <TableCell>{label(x.period)}</TableCell>
                    <TipCell className="text-right text-muted-foreground tabular-nums" tip={base ? <>발표일 종가 {won(base.dayClose)}원 ({ymd(base.dayDate)})<br />{prevLine}</> : prevLine}>
                      {x.announcedOn?.slice(2).replaceAll("-", ".")}
                    </TipCell>
                    <TipCell className={`text-right font-semibold tabular-nums ${tone(s)}`} tip={<>영업이익 실적 {won(x.opIncome)}억 원<br />컨센서스 평균 {won(x.consensus.op?.avg)}억 원</>}>
                      {pct(s)}
                    </TipCell>
                    {REACTION_DAYS.map((d) => {
                      const cell = cells[d];
                      if (!cell) return <TableCell key={d} className="text-right tabular-nums">—</TableCell>;
                      const tip = cell.reached
                        ? <>+{d}거래일 {ymd(cell.date)} 종가 {won(cell.close)}원<br />{prevLine}</>
                        : <>아직 {d}거래일이 지나지 않아 현재 기준<br />{ymd(cell.date)} 종가 {won(cell.close)}원<br />{prevLine}</>;
                      return (
                        <TipCell key={d} className={`text-right tabular-nums ${tone(cell.pct)} ${cell.reached ? "" : "italic"}`} tip={tip}>
                          {pct(cell.pct)}{!cell.reached && <span className="ml-0.5 text-[10px] text-muted-foreground not-italic">현재</span>}
                        </TipCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="mt-1.5 text-[11px] text-muted-foreground">주가 반응은 발표 전날 종가 대비, 발표일을 첫 거래일로 센 거래일 기준입니다. 아직 그 거래일이 오지 않은 칸은 현재 종가 기준이며 &quot;현재&quot;로 표시합니다. 칸에 마우스를 올리면 근거 주가가 보입니다.</p>
        </Section>

        <Section
          title="PER / PBR 밴드 (최근 5년, 월말 기준)"
          action={
            <Tabs value={kind} onValueChange={(v) => setKind(v as "PER" | "PBR")}>
              <TabsList><TabsTrigger value="PER">PER</TabsTrigger><TabsTrigger value="PBR">PBR</TabsTrigger></TabsList>
            </Tabs>
          }
        >
          {band.levels && band.current != null ? (
            <>
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span>{kind} <b className="tabular-nums">{band.current.toFixed(kind === "PBR" ? 2 : 1)}배</b></span>
                  <span className="text-muted-foreground tabular-nums">5년 범위 중 하위 {band.position}%</span>
                </div>
                <div className="relative h-2.5 rounded-full bg-gradient-to-r from-primary/35 via-muted to-destructive/25">
                  <span className="absolute -top-1 h-[18px] w-[3px] -translate-x-px rounded-sm bg-foreground" style={{ left: `${band.position}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                  <span>최저 {band.levels[0].toFixed(kind === "PBR" ? 2 : 1)}배</span><span>최고 {band.levels[4].toFixed(kind === "PBR" ? 2 : 1)}배</span>
                </div>
              </div>
              <BandChart band={band} kind={kind} />
            </>
          ) : <p className="text-sm text-muted-foreground">재무나 주가 데이터가 부족해 {kind} 밴드를 그릴 수 없습니다. 적자 기간은 PER이 비어 있습니다.</p>}
        </Section>

        <Section title="최근 뉴스">
          {c.news.length === 0 && <p className="text-sm text-muted-foreground">갱신하면 최근 뉴스가 보입니다.</p>}
          <ul>
            {c.news.map((n) => (
              <li key={n.url} className="border-b py-2 last:border-b-0">
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{n.title}</a>
                <p className="text-xs text-muted-foreground">{new URL(n.url).hostname.replace(/^www\./, "")}{n.pubDate ? ` · ${md(n.pubDate.slice(0, 10))}` : ""}</p>
                {n.description && <p className="text-xs text-muted-foreground">{n.description}</p>}
              </li>
            ))}
          </ul>
        </Section>
      </CardContent>
    </Card>
  );
}

function TipCell({ className, tip, children }: { className?: string; tip: React.ReactNode; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<TableCell className={`cursor-help ${className ?? ""}`} />}>{children}</TooltipTrigger>
      <TooltipContent className="text-left">{tip}</TooltipContent>
    </Tooltip>
  );
}

function Kpi({ label: l, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{l}</div>
      <div className={`text-xl font-semibold tabular-nums ${className ?? ""}`}>{value}</div>
    </div>
  );
}

