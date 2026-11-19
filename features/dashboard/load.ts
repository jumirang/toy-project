// 화면 한 장에 필요한 데이터를 Supabase에서 읽어 계산까지 마친 형태로 만든다.
import type { ConsensusItem } from "@/features/consensus/extract";
import { industryName } from "@/features/company/industry";
import { periodEnd, shiftPeriod } from "@/features/earnings/period";
import { bandSeries, reactions, type Close } from "@/features/market/metrics";
import { db } from "@/lib/supabase";

import { REACTION_DAYS } from "./reaction-days";
/** 기본 기업(삼성전자, SK하이닉스). 둘러보기에서 보이는 기업이다. */
export const DEFAULT_STOCK_CODES = ["005930", "000660"];

type Supa = Awaited<ReturnType<typeof db>>;

export type Consensus = {
  avg: number | null; min: number | null; max: number | null; source: "news" | "user" | null;
  article: { title: string; url: string; date: string | null } | null;
};
export type Earning = {
  period: string; announcedOn: string | null; status: "past" | "confirmed" | "expected"; basis: string | null;
  revenue: number | null; opIncome: number | null; netIncome: number | null; dateByUser: boolean;
  consensus: Partial<Record<ConsensusItem, Consensus>>;
  reactions: ReturnType<typeof reactions>;
};
export type Band = ReturnType<typeof bandSeries>;
export type CompanyView = {
  stockCode: string; name: string; industry: string | null; homepage: string | null; irUrl: string | null; corpCode: string;
  description: string | null; refreshedAt: string | null; refreshError: string | null;
  earnings: Earning[]; closes: Close[]; per: Band; pbr: Band;
  news: { title: string; description: string | null; url: string; pubDate: string | null }[];
};
export type DashboardData = { companies: CompanyView[]; refreshedAt: string | null; today: string };

async function all<T>(supa: Supa, table: string, codes: string[], order: string): Promise<T[]> {
  if (!codes.length) return [];
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from(table).select("*").in("stock_code", codes).order(order).range(from, from + 999);
    if (error) throw new Error(`DB ${table}: ${error.message}`);
    out.push(...(data as T[]));
    if (data.length < 1000) return out;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase 행을 화면 모델로 옮기는 경계
type Row = Record<string, any>;

/**
 * account: 로그인한 계정의 관심 기업과 그 계정이 고친 값을 공통 데이터 위에 얹는다.
 * guest: 둘러보기. 기본 기업 둘의 공통 데이터만 읽는다.
 */
export async function loadDashboard(mode: "account" | "guest"): Promise<DashboardData> {
  const supa = await db();
  let codes = DEFAULT_STOCK_CODES;
  if (mode === "account") {
    const { data: wl, error: wlError } = await supa.from("watchlist").select("stock_code").order("added_at");
    if (wlError) throw new Error(`DB watchlist: ${wlError.message}`);
    codes = (wl as Row[]).map((w) => w.stock_code);
  }
  const { data: found, error } = codes.length ? await supa.from("companies").select("*").in("stock_code", codes) : { data: [], error: null };
  if (error) throw new Error(`DB companies: ${error.message}`);
  const companies = codes.map((code) => (found as Row[]).find((c) => c.stock_code === code)).filter((c): c is Row => !!c);
  const mine = (table: string, order: string) => (mode === "account" ? all<Row>(supa, table, codes, order) : Promise.resolve([] as Row[]));
  const [earnings, consensus, fins, prices, news, state, notes, myCons, myDates] = await Promise.all([
    all<Row>(supa, "earnings", codes, "period"),
    all<Row>(supa, "consensus", codes, "period"),
    all<Row>(supa, "quarterly_financials", codes, "period"),
    all<Row>(supa, "prices", codes, "trade_date"),
    all<Row>(supa, "news", codes, "pub_date"),
    supa.from("app_state").select("refreshed_at").eq("id", 1).maybeSingle(),
    mine("user_notes", "stock_code"),
    mine("user_consensus", "period"),
    mine("user_dates", "period"),
  ]);

  const views = companies.map((c): CompanyView => {
    const code = c.stock_code;
    const px = prices.filter((p) => p.stock_code === code);
    const closes: Close[] = px.map((p) => ({ date: p.trade_date, close: Number(p.close) }));
    const sharesAsOf = (date: string) => Number(px.filter((p) => p.trade_date <= date).at(-1)?.shares ?? px.at(-1)?.shares ?? 0) || null;
    const f = fins.filter((r) => r.stock_code === code);
    const finAsOf = (date: string) => f.filter((r) => periodEnd(r.period) <= date);
    const eps = (date: string) => {
      const last4 = finAsOf(date).slice(-4);
      const sh = sharesAsOf(date);
      if (last4.length < 4 || last4.some((r) => r.net_income == null) || !sh) return null;
      // 4개 분기가 이어져 있어야 한다
      if (shiftPeriod(last4[0].period, 3) !== last4[3].period) return null;
      return (last4.reduce((s, r) => s + Number(r.net_income), 0) * 1e8) / sh;
    };
    const bps = (date: string) => {
      const lastQ = finAsOf(date).at(-1);
      const sh = sharesAsOf(date);
      return lastQ?.equity != null && sh ? (Number(lastQ.equity) * 1e8) / sh : null;
    };

    const ers = earnings.filter((e) => e.stock_code === code);
    return {
      stockCode: code, name: c.name, corpCode: c.corp_code, industry: industryName(c.industry_code),
      homepage: c.homepage, irUrl: c.ir_url, description: notes.find((n) => n.stock_code === code)?.description ?? null, refreshedAt: c.refreshed_at, refreshError: c.refresh_error,
      closes,
      per: bandSeries(closes, eps),
      pbr: bandSeries(closes, bps),
      news: news.filter((n) => n.stock_code === code).reverse().slice(0, 8)
        .map((n) => ({ title: n.title, description: n.description, url: n.url, pubDate: n.pub_date })),
      earnings: ers.map((e): Earning => {
        const myDate: string | null = myDates.find((d) => d.stock_code === code && d.period === e.period)?.announced_on ?? null;
        return {
        period: e.period, announcedOn: myDate ?? e.announced_on, status: e.status, basis: myDate ? "user" : e.basis, dateByUser: !!myDate,
        revenue: e.revenue == null ? null : Number(e.revenue), opIncome: e.op_income == null ? null : Number(e.op_income),
        netIncome: e.net_income == null ? null : Number(e.net_income),
        reactions: e.status === "past" && e.announced_on ? reactions(closes, e.announced_on, [...REACTION_DAYS]) : { base: null, cells: {} },
        consensus: Object.fromEntries((["rev", "op", "net"] as ConsensusItem[]).flatMap((item) => {
          // 공통 값(뉴스 자동 추출) 위에 이 계정이 고친 값을 얹는다.
          const k = consensus.find((x) => x.stock_code === code && x.period === e.period && x.item === item);
          const u = myCons.find((x) => x.stock_code === code && x.period === e.period && x.item === item);
          if (!k && !u) return [];
          const num = (v: unknown) => (v == null ? null : Number(v));
          return [[item, {
            avg: u?.avg_set ? num(u.avg) : num(k?.avg), min: num(u?.min), max: num(u?.max),
            source: u?.avg_set ? (u.avg == null ? null : "user") : (k?.avg_source ?? null),
            article: k?.article_url ? { title: k.article_title, url: k.article_url, date: k.article_date } : null,
          }]];
        })),
        };
      }),
    };
  });
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10); // 한국 날짜
  return { companies: views, refreshedAt: (state.data as Row | null)?.refreshed_at ?? null, today };
}
