"use server";
// 화면에서 부르는 서버 함수. 쓰기는 모두 로그인한 사용자만 한다(docs/decisions/data-ownership.md).
// 데이터베이스 RLS가 같은 규칙을 한 번 더 지킨다.
import { revalidatePath } from "next/cache";

import type { ConsensusItem } from "@/features/consensus/extract";
import { refreshCompany } from "@/features/refresh/refresh-company";
import { fetchListedCorps } from "@/features/sources/dart";
import { currentUserId, db } from "@/lib/supabase";

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

/** 로그인한 사용자의 Supabase 클라이언트. 로그아웃 상태면 거부한다. */
async function signedIn() {
  const supa = await db();
  const userId = await currentUserId(supa);
  if (!userId) throw new Error("로그인이 필요합니다.");
  return { supa, userId };
}

type CorpHit = { stock_code: string; name: string };

/** DART 상장사 목록을 새로 받아 corps 테이블에 쌓는다. */
async function reloadCorps() {
  const { supa } = await signedIn();
  const corps = await fetchListedCorps();
  for (let i = 0; i < corps.length; i += 1000) await ok(supa.from("corps").upsert(corps.slice(i, i + 1000)));
  return corps;
}

/** 검색용 국내 상장사 전체 목록. 처음 한 번은 DART에서 받아 보관한다. */
export async function listCorps(): Promise<CorpHit[]> {
  const { supa } = await signedIn();
  const out: CorpHit[] = [];
  for (let from = 0; ; from += 1000) {
    const page = (await ok(supa.from("corps").select("stock_code, name").order("stock_code").range(from, from + 999))) ?? [];
    out.push(...page);
    if (page.length < 1000) break;
  }
  if (out.length) return out;
  return (await reloadCorps()).map(({ stock_code, name }) => ({ stock_code, name }));
}

/** 보관한 목록에 없을 때: DART 상장사 목록을 다시 받아(신규 상장 반영) 찾는다. */
export async function searchCorpsExternal(query: string): Promise<CorpHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const corps = await reloadCorps();
  return corps
    .filter((c) => c.name.toLowerCase().includes(q) || c.stock_code.startsWith(q))
    .slice(0, 8)
    .map(({ stock_code, name }) => ({ stock_code, name }));
}

/** 관심 기업 추가: 기업 정보는 공통, 목록은 이 계정의 것. */
export async function addCompany(stockCode: string) {
  const { supa, userId } = await signedIn();
  const corp = await ok(supa.from("corps").select("*").eq("stock_code", stockCode).single());
  await ok(supa.from("companies").upsert({ stock_code: corp.stock_code, corp_code: corp.corp_code, name: corp.name }, { onConflict: "stock_code", ignoreDuplicates: true }));
  await ok(supa.from("watchlist").upsert({ user_id: userId, stock_code: corp.stock_code }, { ignoreDuplicates: true }));
  revalidatePath("/");
}

/** 관심 기업 삭제: 이 계정의 목록에서만 뺀다. 공통 데이터는 남는다. */
export async function removeCompany(stockCode: string) {
  const { supa, userId } = await signedIn();
  await ok(supa.from("watchlist").delete().eq("user_id", userId).eq("stock_code", stockCode));
  revalidatePath("/");
}

/** 한 기업의 공통 데이터 갱신. 실패해도 예외를 던지지 않고 이유를 돌려준다(나머지 기업은 계속 갱신). */
export async function refreshOne(stockCode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supa } = await signedIn();
  try {
    await refreshCompany(supa, stockCode);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await supa.from("companies").update({ refresh_error: error }).eq("stock_code", stockCode);
    return { ok: false, error };
  }
}

export async function finishRefresh() {
  const { supa } = await signedIn();
  await ok(supa.from("app_state").update({ refreshed_at: new Date().toISOString() }).eq("id", 1));
  revalidatePath("/");
}

type Values = Partial<Record<ConsensusItem, { avg: number | null; min: number | null; max: number | null }>>;

/** 이 계정이 고친 컨센서스. 평균이 공통 값과 달라진 항목은 '직접 수정'으로 남긴다. */
export async function saveConsensus(stockCode: string, period: string, values: Values) {
  const { supa, userId } = await signedIn();
  const [common, mine] = await Promise.all([
    ok(supa.from("consensus").select("item, avg").eq("stock_code", stockCode).eq("period", period)),
    ok(supa.from("user_consensus").select("item, avg_set").eq("stock_code", stockCode).eq("period", period)),
  ]);
  const rows = Object.entries(values).map(([item, v]) => {
    const base = (common as { item: string; avg: number | null }[]).find((c) => c.item === item);
    const wasSet = (mine as { item: string; avg_set: boolean }[]).find((c) => c.item === item)?.avg_set ?? false;
    const avgSet = wasSet || (base?.avg == null ? null : Number(base.avg)) !== v!.avg;
    return { user_id: userId, stock_code: stockCode, period, item, avg: avgSet ? v!.avg : null, avg_set: avgSet, min: v!.min, max: v!.max };
  });
  await ok(supa.from("user_consensus").upsert(rows));
  revalidatePath("/");
}

export async function saveAnnouncementDate(stockCode: string, period: string, date: string) {
  const { supa, userId } = await signedIn();
  await ok(supa.from("user_dates").upsert({ user_id: userId, stock_code: stockCode, period, announced_on: date }));
  revalidatePath("/");
}

export async function saveDescription(stockCode: string, description: string) {
  const { supa, userId } = await signedIn();
  const text = description.trim();
  if (text) await ok(supa.from("user_notes").upsert({ user_id: userId, stock_code: stockCode, description: text }));
  else await ok(supa.from("user_notes").delete().eq("user_id", userId).eq("stock_code", stockCode));
  revalidatePath("/");
}
