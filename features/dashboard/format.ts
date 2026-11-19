export const won = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("ko-KR", { maximumFractionDigits: digits });

export const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);

/** 국내 관례: 상승·호실적 빨강, 하락·부진 파랑 */
export const tone = (v: number | null | undefined) =>
  v == null || v === 0 ? "" : v > 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400";

export const md = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
export const ymd = (date: string) => `${date.slice(0, 4)}년 ${md(date)}`;
