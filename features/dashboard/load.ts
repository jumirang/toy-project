// 화면 한 장에 필요한 데이터를 Supabase에서 읽어 계산까지 마친 형태로 만든다.
import type { ConsensusItem } from "@/features/consensus/extract";
import { industryName } from "@/features/company/industry";
import { periodEnd, shiftPeriod } from "@/features/earnings/period";
import { bandSeries, reactions, type Close } from "@/features/market/metrics";
import { db } from "@/lib/supabase";

export const REACTION_DAYS = [1, 5, 20, 30, 60] as const;

export type Consensus = {
  avg: number | null; min: number | null; max: number | null; source: "news" | "user" | null;
  article: { title: string; url: string; date: string | null } | null;
};
export type Earning = {
  period: string; announcedOn: string | null; status: "past" | "confirmed" | "expected"; basis: string | null;
  revenue: number | null; opIncome: number | null; netIncome: number | null; dateByUser: boolean;
  consensus: Partial<Record<ConsensusItem, Consensus>>;
  reactions: Record<number, number | null>;
};
export type Band = ReturnType<typeof bandSeries>;
export type CompanyView = {
  stockCode: string; name: string; industry: string | null; homepage: string | null; irUrl: string | null; corpCode: string;
  description: string | null; refreshedAt: string | null; refreshError: string | null;
  earnings: Earning[]; closes: Close[]; per: Band; pbr: Band;
  news: { title: string; description: string | null; url: string; pubDate: string | null }[];
};
export type DashboardData = { companies: CompanyView[]; refreshedAt: string | null; today: string };

async function all<T>(table: string, codes: string[], order: string): Promise<T[]> {
  if (!codes.length) return [];
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from(table).select("*").in("stock_code", codes).order(order).range(from, from + 999);
    if (error) throw new Error(`DB ${table}: ${error.message}`);
    out.push(...(data as T[]));
    if (data.length < 1000) return out;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase 행을 화면 모델로 옮기는 경계
type Row = Record<string, any>;

export async function loadDashboard(): Promise<DashboardData> {
  const supa = db();
  const { data: companies, error } = await supa.from("companies").select("*").order("added_at");
  if (error) throw new Error(`DB companies: ${error.message}`);
  const codes = (companies as Row[]).map((c) => c.stock_code);
  const [earnings, consensus, fins, prices, news, state] = await Promise.all([
    all<Row>("earnings", codes, "period"),
    all<Row>("consensus", codes, "period"),
    all<Row>("quarterly_financials", codes, "period"),
    all<Row>("prices", codes, "trade_date"),
    all<Row>("news", codes, "pub_date"),
    supa.from("app_state").select("refreshed_at").eq("id", 1).maybeSingle(),
  ]);

  const views = (companies as Row[]).map((c): CompanyView => {
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
      homepage: c.homepage, irUrl: c.ir_url, description: c.description, refreshedAt: c.refreshed_at, refreshError: c.refresh_error,
      closes,
      per: bandSeries(closes, eps),
      pbr: bandSeries(closes, bps),
      news: news.filter((n) => n.stock_code === code).reverse().slice(0, 8)
        .map((n) => ({ title: n.title, description: n.description, url: n.url, pubDate: n.pub_date })),
      earnings: ers.map((e): Earning => ({
        period: e.period, announcedOn: e.announced_on, status: e.status, basis: e.basis, dateByUser: e.date_by_user,
        revenue: e.revenue == null ? null : Number(e.revenue), opIncome: e.op_income == null ? null : Number(e.op_income),
        netIncome: e.net_income == null ? null : Number(e.net_income),
        reactions: e.status === "past" && e.announced_on ? reactions(closes, e.announced_on, [...REACTION_DAYS]) : {},
        consensus: Object.fromEntries(
          consensus.filter((k) => k.stock_code === code && k.period === e.period).map((k) => [k.item, {
            avg: k.avg == null ? null : Number(k.avg), min: k.min == null ? null : Number(k.min), max: k.max == null ? null : Number(k.max),
            source: k.avg_source,
            article: k.article_url ? { title: k.article_title, url: k.article_url, date: k.article_date } : null,
          }]),
        ),
      })),
    };
  });
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10); // 한국 날짜
  return { companies: views, refreshedAt: (state.data as Row | null)?.refreshed_at ?? null, today };
}
