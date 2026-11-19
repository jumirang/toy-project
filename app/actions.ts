"use server";
// 화면에서 부르는 서버 함수. 로그인 없는 임시 단계라 인증 확인이 없다 (스펙: 비공개 환경 전제).
import { revalidatePath } from "next/cache";

import type { ConsensusItem } from "@/features/consensus/extract";
import { refreshCompany } from "@/features/refresh/refresh-company";
import { fetchListedCorps } from "@/features/sources/dart";
import { db } from "@/lib/supabase";

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export async function searchCorps(query: string): Promise<{ stock_code: string; name: string }[]> {
  const q = query.trim();
  if (!q) return [];
  const supa = db();
  const { count } = await supa.from("corps").select("stock_code", { count: "exact", head: true });
  if (!count) {
    const corps = await fetchListedCorps();
    for (let i = 0; i < corps.length; i += 1000) await ok(supa.from("corps").upsert(corps.slice(i, i + 1000)));
  }
  const safe = q.replace(/[%,()]/g, "");
  return (await ok(supa.from("corps").select("stock_code, name").or(`name.ilike.%${safe}%,stock_code.like.${safe}%`).order("name").limit(8))) ?? [];
}

export async function addCompany(stockCode: string) {
  const supa = db();
  const corp = await ok(supa.from("corps").select("*").eq("stock_code", stockCode).single());
  await ok(supa.from("companies").upsert({ stock_code: corp.stock_code, corp_code: corp.corp_code, name: corp.name }, { onConflict: "stock_code", ignoreDuplicates: true }));
  revalidatePath("/");
}

export async function removeCompany(stockCode: string) {
  await ok(db().from("companies").delete().eq("stock_code", stockCode));
  revalidatePath("/");
}

/** 한 기업 갱신. 실패해도 예외를 던지지 않고 이유를 돌려준다(나머지 기업은 계속 갱신). */
export async function refreshOne(stockCode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await refreshCompany(stockCode);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db().from("companies").update({ refresh_error: error }).eq("stock_code", stockCode);
    return { ok: false, error };
  }
}

export async function finishRefresh() {
  await ok(db().from("app_state").update({ refreshed_at: new Date().toISOString() }).eq("id", 1));
  revalidatePath("/");
}

type Values = Partial<Record<ConsensusItem, { avg: number | null; min: number | null; max: number | null }>>;

/** 사용자가 고친 컨센서스. 평균이 바뀐 항목은 출처를 '직접 수정'으로 바꾼다. */
export async function saveConsensus(stockCode: string, period: string, values: Values) {
  const supa = db();
  const current = await ok(supa.from("consensus").select("item, avg, avg_source").eq("stock_code", stockCode).eq("period", period));
  const rows = Object.entries(values).map(([item, v]) => {
    const prev = (current as { item: string; avg: number | null; avg_source: string | null }[]).find((c) => c.item === item);
    const avgChanged = (prev?.avg == null ? null : Number(prev.avg)) !== v!.avg;
    return {
      stock_code: stockCode, period, item, avg: v!.avg, min: v!.min, max: v!.max,
      avg_source: avgChanged ? (v!.avg == null ? null : "user") : (prev?.avg_source ?? null),
    };
  });
  await ok(supa.from("consensus").upsert(rows));
  revalidatePath("/");
}

export async function saveAnnouncementDate(stockCode: string, period: string, date: string) {
  await ok(db().from("earnings").update({ announced_on: date, date_by_user: true, basis: "user" }).eq("stock_code", stockCode).eq("period", period));
  revalidatePath("/");
}

export async function saveDescription(stockCode: string, description: string) {
  await ok(db().from("companies").update({ description: description.trim() || null }).eq("stock_code", stockCode));
  revalidatePath("/");
}
