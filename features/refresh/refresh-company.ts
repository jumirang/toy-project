// 한 기업의 데이터를 외부 출처에서 다시 가져와 Supabase에 보관한다.
// 조합 계층: 출처 클라이언트(sources)와 순수 로직(earnings, consensus)을 여기서 엮는다.
import { extractConsensus, type ConsensusItem } from "@/features/consensus/extract";
import { announcedPeriodOf, periodEnd, quarterOf, shiftPeriod } from "@/features/earnings/period";
import { parsePreliminaryResult } from "@/features/earnings/preliminary";
import { nextAnnouncement } from "@/features/earnings/schedule";
import { fetchCompanyInfo, fetchDisclosureText, fetchMainAccounts, listExchangeDisclosures, type Disclosure } from "@/features/sources/dart";
import { fetchDailyPrices } from "@/features/sources/krx-prices";
import { searchNews, type NewsItem } from "@/features/sources/naver-news";
import type { db } from "@/lib/supabase";

const HISTORY = 8; // 과거 발표별 표에 보여 줄 분기 수
const dash = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const compact = (d: string) => d.replaceAll("-", "");
const today = () => new Date().toISOString().slice(0, 10);
const daysBefore = (date: string, n: number) => new Date(Date.parse(date) - n * 86_400_000).toISOString().slice(0, 10);

async function check<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`DB: ${error.message}`);
  return data;
}

type EarningsRow = {
  stock_code: string; period: string; announced_on: string | null; status: string; basis: string | null;
  rcept_no: string | null; revenue: number | null; op_income: number | null; net_income: number | null; date_by_user: boolean;
};

/** 공통 데이터를 쓰므로 로그인한 사용자의 클라이언트를 받는다(RLS: 공통 데이터 쓰기는 로그인 사용자만). */
/** onStage: 단계가 바뀔 때마다 화면에 보일 진행 문구를 받는다. */
export async function refreshCompany(supa: Awaited<ReturnType<typeof db>>, stockCode: string, onStage: (stage: string) => void = () => {}): Promise<void> {
  const company = await check(supa.from("companies").select("*").eq("stock_code", stockCode).single());
  const corp = company.corp_code as string;
  const name = company.name as string;
  // 기사에서 이 기업을 가리키는 이름 (영문 상호는 한글 표기도 쓰인다)
  const names = [name, ...({ NAVER: ["네이버"], "LG에너지솔루션": ["LG엔솔"], "한화에어로스페이스": ["한화에어로"] } as Record<string, string[]>)[name] ?? []];

  // 1. 기업개황: 업종, 홈페이지, IR 링크
  onStage("DART 기업개황 연동 중");
  const info = await fetchCompanyInfo(corp);
  await check(supa.from("companies").update({ industry_code: info.industry_code, homepage: info.homepage, ir_url: info.ir_url }).eq("stock_code", stockCode));

  // 2. 잠정실적 공시와 IR 공시 (최근 3년)
  onStage("DART 잠정실적 공시 읽는 중");
  const now = today();
  const disclosures = await listExchangeDisclosures(corp, compact(daysBefore(now, 365 * 3 + 30)), compact(now));
  const prelim = disclosures.filter((d) => /영업\(잠정\)실적\(공정공시\)/.test(d.report_nm));
  const consolidated = prelim.filter((d) => d.report_nm.includes("연결"));
  const chosen = consolidated.length ? consolidated : prelim;

  const byPeriod = new Map<string, Disclosure[]>();
  for (const d of chosen) {
    const p = announcedPeriodOf(dash(d.rcept_dt));
    byPeriod.set(p, [...(byPeriod.get(p) ?? []), d]);
  }
  const existing = (await check(supa.from("earnings").select("*").eq("stock_code", stockCode))) as EarningsRow[];
  const stored = new Map(existing.map((e) => [e.period, e]));
  const periods = [...byPeriod.keys()].sort().reverse();

  const rows: EarningsRow[] = [];
  for (const [i, p] of periods.entries()) {
    const list = byPeriod.get(p)!.sort((a, b) => a.rcept_no.localeCompare(b.rcept_no));
    const announced = dash(list[0].rcept_dt);
    const latest = list.at(-1)!;
    const prev = stored.get(p);
    let values = { revenue: prev?.revenue ?? null, op_income: prev?.op_income ?? null, net_income: prev?.net_income ?? null };
    // 표에 보일 분기만 원문을 읽고, 이미 다 읽은 분기는 다시 읽지 않는다.
    // 한 분기에 속보(매출·영업이익만), 상세, 정정 공시가 섞이므로 항목이 가장 많이 채워진 공시를 쓴다.
    const unread = prev?.rcept_no !== latest.rcept_no || prev?.revenue == null || prev?.op_income == null || prev?.net_income == null;
    if (i <= HISTORY && unread) {
      let best = -1;
      for (const d of [...list].reverse()) {
        const parsed = parsePreliminaryResult(await fetchDisclosureText(d.rcept_no));
        if (!parsed || parsed.period !== p) continue;
        const filled = [parsed.revenue, parsed.opIncome, parsed.netIncome].filter((v) => v != null).length;
        if (filled > best) {
          best = filled;
          values = { revenue: parsed.revenue, op_income: parsed.opIncome, net_income: parsed.netIncome };
        }
        if (filled === 3) break;
      }
    }
    rows.push({ stock_code: stockCode, period: p, announced_on: announced, status: "past", basis: "disclosure", rcept_no: latest.rcept_no, ...values, date_by_user: false });
  }

  // 3. 다음 분기 예정일
  const lastPast = periods[0];
  if (lastPast) {
    const next = shiftPeriod(lastPast, 1);
    // 직전 분기의 마지막 공시(상세·정정 포함) 이후 IR만 다음 분기 것으로 본다.
    // 첫 잠정공시 뒤에 열리는 그 분기 실적설명회를 다음 분기 예정으로 읽지 않기 위해서다.
    const lastAnnouncedOn = dash(byPeriod.get(lastPast)!.map((d) => d.rcept_dt).sort().at(-1)!);
    const irEvents = [];
    for (const d of disclosures.filter((x) => /기업설명회\(IR\)/.test(x.report_nm) && dash(x.rcept_dt) >= lastAnnouncedOn)) {
      const text = await fetchDisclosureText(d.rcept_no);
      const date = /일시\s*(\d{4}-\d{2}-\d{2})/.exec(text)?.[1];
      if (date) irEvents.push({ date, mentionsEarnings: /실적/.test(text) });
    }
    const lastYear = rows.find((r) => r.period === shiftPeriod(next, -4))?.announced_on ?? null;
    const exp = nextAnnouncement({ lastAnnouncedOn, lastYearSameQuarterOn: lastYear, irEvents });
    const prevNext = stored.get(next);
    if (prevNext?.date_by_user) rows.push(prevNext);
    else if (exp) rows.push({ stock_code: stockCode, period: next, announced_on: exp.date, status: exp.status, basis: exp.basis, rcept_no: null, revenue: null, op_income: null, net_income: null, date_by_user: false });
  }
  if (rows.length) await check(supa.from("earnings").upsert(rows));

  // 4. 분기 재무(밴드용): 최근 6년 주요계정. 이미 있는 분기는 최근 2개만 다시 읽는다.
  onStage("DART 분기 재무 읽는 중");
  const fin = new Map<string, { net_income: number | null; equity: number | null }>();
  const haveFin = new Set(((await check(supa.from("quarterly_financials").select("period").eq("stock_code", stockCode))) as { period: string }[]).map((r) => r.period));
  const thisYear = Number(now.slice(0, 4));
  const recent = new Set([lastPast, lastPast && shiftPeriod(lastPast, -1)]);
  const eok = (s?: string) => (s && s !== "-" ? Number(s.replace(/,/g, "")) / 1e8 : null);
  for (let y = thisYear - 6; y <= thisYear; y++) {
    const cum: Record<number, number | null> = {};
    for (const [q, code] of [[1, "11013"], [2, "11012"], [3, "11014"], [4, "11011"]] as const) {
      const period = `${y}-Q${q}`;
      if (periodEnd(period) > now) continue;
      const q4 = `${y}-Q4`;
      const neededForQ4 = q === 3 && (!haveFin.has(q4) || recent.has(q4)); // 4분기 = 연간 - 3분기 누적
      if (haveFin.has(period) && !recent.has(period) && !neededForQ4) continue;
      const list = await fetchMainAccounts(corp, y, code);
      const fs = list.some((r) => r.fs_div === "CFS") ? "CFS" : "OFS";
      const rowsOf = list.filter((r) => r.fs_div === fs);
      const ni = rowsOf.find((r) => /당기순이익/.test(r.account_nm));
      const eq = rowsOf.find((r) => r.account_nm === "자본총계");
      if (!ni && !eq) continue;
      let quarterNi = eok(ni?.thstrm_amount);
      if (q === 3) cum[3] = eok(ni?.thstrm_add_amount);
      if (q === 4) quarterNi = quarterNi != null && cum[3] != null ? quarterNi - cum[3] : null;
      fin.set(period, { net_income: quarterNi, equity: eok(eq?.thstrm_amount) });
    }
  }
  if (fin.size) await check(supa.from("quarterly_financials").upsert([...fin].map(([period, v]) => ({ stock_code: stockCode, period, ...v }))));

  // 5. 일별 종가: 마지막 저장일 다음 날부터 (처음이면 5년 1개월 전부터)
  onStage("주가 시세 가져오는 중");
  const last = (await check(supa.from("prices").select("trade_date").eq("stock_code", stockCode).order("trade_date", { ascending: false }).limit(1))) as { trade_date: string }[];
  const begin = last[0] ? daysBefore(last[0].trade_date, -1) : daysBefore(now, 365 * 5 + 40);
  const prices = await fetchDailyPrices(stockCode, compact(begin));
  for (let i = 0; i < prices.length; i += 1000) {
    await check(supa.from("prices").upsert(prices.slice(i, i + 1000).map((p) => ({ stock_code: stockCode, ...p }))));
  }

  // 6. 최근 뉴스
  onStage("네이버 뉴스 모으는 중");
  const latestNews = (await searchNews(`${name} 실적`, { sort: "date", display: 50 })).filter((n) => names.some((x) => n.title.includes(x))).slice(0, 20);
  if (latestNews.length) {
    await check(supa.from("news").upsert(latestNews.map((n) => ({ stock_code: stockCode, url: n.url, title: n.title, description: n.description, pub_date: n.pubDate }))));
  }

  // 7. 컨센서스 평균: 표에 보일 과거 분기와 다음 분기. 사용자가 고친 값은 덮어쓰지 않는다.
  onStage("뉴스에서 컨센서스 찾는 중");
  const cons = (await check(supa.from("consensus").select("*").eq("stock_code", stockCode))) as {
    period: string; item: ConsensusItem; avg: number | null; avg_source: string | null; article_url: string | null;
  }[];
  const consOf = (p: string, item: ConsensusItem) => cons.find((c) => c.period === p && c.item === item);
  const targets = rows.filter((r) => r.status !== "past" || rows.indexOf(r) < HISTORY);
  for (const r of targets) {
    const past = r.status === "past";
    const items: ConsensusItem[] = ["rev", "op", "net"];
    const settled = items.every((it) => consOf(r.period, it)?.avg_source === "user" || (past && consOf(r.period, it)?.article_url));
    if (settled) continue;
    const q = quarterOf(r.period);
    const found = await searchNews(`${names.at(-1)} ${q}분기 컨센서스`, { sort: past ? "sim" : "date" });
    const windowEnd = past ? r.announced_on! : now;
    const windowStart = daysBefore(r.announced_on ?? now, 30);
    const inWindow = found
      .filter((n) => n.pubDate.slice(0, 10) >= windowStart && n.pubDate.slice(0, 10) <= windowEnd && n.pubDate.slice(0, 10) > periodEnd(shiftPeriod(r.period, -1)))
      .sort((a, b) => b.pubDate.localeCompare(a.pubDate)); // 발표일에 가까운 기사 먼저
    const upserts = [];
    for (const item of items) {
      const prev = consOf(r.period, item);
      if (prev?.avg_source === "user") continue;
      // 그 분기 실적(없으면 직전 분기 실적)의 1/3–3배 밖이면 기사 속 다른 숫자를 읽은 것으로 보고 버린다.
      const field = ({ rev: "revenue", op: "op_income", net: "net_income" } as const)[item];
      const ref = r[field] ?? rows.find((x) => x.status === "past" && x[field] != null)?.[field] ?? null;
      const plausible = (v: number) => ref == null || ref <= 0 || (v >= ref / 3 && v <= ref * 3);
      const hit = inWindow
        .map((n) => ({ n, v: extractConsensus(`${n.title}. ${n.description}`, q, names)[item] }))
        .find((x) => x.v != null && plausible(x.v));
      const related: NewsItem | undefined = hit?.n ?? inWindow[0];
      upserts.push({
        stock_code: stockCode, period: r.period, item,
        avg: hit?.v ?? null, avg_source: hit ? "news" : null,
        article_title: related?.title ?? null, article_url: related?.url ?? null, article_date: related?.pubDate ?? null,
      });
    }
    if (upserts.length) await check(supa.from("consensus").upsert(upserts));
  }

  await check(supa.from("companies").update({ refreshed_at: new Date().toISOString(), refresh_error: null }).eq("stock_code", stockCode));
}
