// 분기 표기 'YYYY-Qn'.

export const quarterOf = (period: string) => Number(period.slice(-1));

export function periodEnd(period: string): string {
  const y = period.slice(0, 4);
  return { 1: `${y}-03-31`, 2: `${y}-06-30`, 3: `${y}-09-30`, 4: `${y}-12-31` }[quarterOf(period)]!;
}

export function shiftPeriod(period: string, by: number): string {
  const idx = Number(period.slice(0, 4)) * 4 + quarterOf(period) - 1 + by;
  return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
}

/** 공시일(YYYY-MM-DD)로 짐작한 발표 대상 분기: 1–3월 공시는 전년 4분기, 4–6월은 1분기… */
export function announcedPeriodOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m <= 3 ? `${y - 1}-Q4` : `${y}-Q${Math.floor((m - 1) / 3)}`;
}

export const label = (period: string) => `${period.slice(0, 4)}년 ${quarterOf(period)}분기`;
