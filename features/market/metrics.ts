// 종가 시계열로 계산하는 발표 후 주가 반응과 PER/PBR 밴드. closes는 날짜 오름차순.

export type Close = { date: string; close: number };

const pct = (from: number, to: number) => ((to - from) * 100) / from;

/** 발표 전날(직전 거래일) 종가 대비 기준일(휴장이면 직전 거래일, 없으면 가장 최근) 종가 변동률. */
export function priceChange(closes: Close[], announcedOn: string, refDate?: string) {
  const prev = closes.filter((c) => c.date < announcedOn).at(-1);
  const ref = closes.filter((c) => c.date <= (refDate ?? "9999-12-31")).at(-1);
  if (!prev || !ref) return null;
  return { prevClose: prev.close, refClose: ref.close, refDate: ref.date, pct: pct(prev.close, ref.close) };
}

export type ReactionCell = { date: string; close: number; pct: number; reached: boolean };
export type ReactionBase = { prevDate: string; prevClose: number; dayDate: string; dayClose: number };

/**
 * 발표일을 첫 거래일로 셀 때 N번째 거래일 종가와 발표 전날 종가 대비 변동률.
 * 아직 N거래일이 안 지난 첫 칸은 가장 최근 거래일(현재) 기준으로 채우고(reached: false), 그 뒤 칸은 null.
 */
export function reactions(closes: Close[], announcedOn: string, offsets: number[]) {
  const prev = closes.filter((c) => c.date < announcedOn).at(-1);
  const after = closes.filter((c) => c.date >= announcedOn);
  const base: ReactionBase | null = prev && after[0] ? { prevDate: prev.date, prevClose: prev.close, dayDate: after[0].date, dayClose: after[0].close } : null;
  let filledCurrent = false;
  const cells: Record<number, ReactionCell | null> = {};
  for (const n of offsets) {
    const hit = after[n - 1];
    if (!prev || !after.length) cells[n] = null;
    else if (hit) cells[n] = { date: hit.date, close: hit.close, pct: pct(prev.close, hit.close), reached: true };
    else if (!filledCurrent) {
      const last = after.at(-1)!;
      cells[n] = { date: last.date, close: last.close, pct: pct(prev.close, last.close), reached: false };
      filledCurrent = true;
    } else cells[n] = null;
  }
  return { base, cells };
}

export type BandPoint = { month: string; price: number; multiple: number | null };

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/**
 * 최근 60개월 월말 종가와 그 시점의 주당 값(EPS 또는 BPS)으로 배수를 구하고,
 * 유효한 배수의 최저–최고를 4등분한 5개 밴드와 현재 위치(하위 %)를 낸다.
 */
export function bandSeries(closes: Close[], perShareAsOf: (date: string) => number | null) {
  const monthEnd = new Map<string, Close>();
  for (const c of closes) monthEnd.set(c.date.slice(0, 7), c);
  const points: BandPoint[] = [...monthEnd.entries()].slice(-60).map(([month, c]) => {
    const ps = perShareAsOf(c.date);
    return { month, price: c.close, multiple: ps && ps > 0 ? round4(c.close / ps) : null };
  });
  const valid = points.map((p) => p.multiple).filter((m): m is number => m != null);
  if (!valid.length) return { points, levels: null, current: null, position: null };
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const current = valid.at(-1)!;
  return {
    points,
    levels: [0, 1, 2, 3, 4].map((k) => round4(min + ((max - min) * k) / 4)),
    current,
    position: max === min ? 100 : Math.round(((current - min) * 100) / (max - min)),
  };
}
