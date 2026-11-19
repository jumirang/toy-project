// 다음 실적 발표 예정일: 실적 관련 IR 개최 공시가 있으면 확정, 없으면 작년 같은 분기 발표일 기준 예상.

export type IrEvent = { date: string; mentionsEarnings: boolean };
export type Expected = { date: string; status: "confirmed" | "expected"; basis: "ir" | "last-year" };

function plusOneYearOnWeekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y + 1, m - 1, d));
  const dow = t.getUTCDay();
  if (dow === 6) t.setUTCDate(t.getUTCDate() + 2);
  if (dow === 0) t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

export function nextAnnouncement(input: {
  lastAnnouncedOn: string | null;
  lastYearSameQuarterOn: string | null;
  irEvents: IrEvent[];
}): Expected | null {
  const ir = input.irEvents
    .filter((e) => e.mentionsEarnings && (!input.lastAnnouncedOn || e.date > input.lastAnnouncedOn))
    .map((e) => e.date)
    .sort()[0];
  if (ir) return { date: ir, status: "confirmed", basis: "ir" };
  if (input.lastYearSameQuarterOn) {
    return { date: plusOneYearOnWeekday(input.lastYearSameQuarterOn), status: "expected", basis: "last-year" };
  }
  return null;
}
