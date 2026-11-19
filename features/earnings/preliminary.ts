// DART 영업(잠정)실적(공정공시) 원문에서 당해 분기 실적을 억원으로 읽는다.

export type PreliminaryResult = { period: string; revenue: number | null; opIncome: number | null; netIncome: number | null };

// 단위 → 억원으로 바꾸는 [곱, 나눔]
const UNIT: Record<string, [number, number]> = {
  조원: [10_000, 1], 억원: [1, 1], 백만원: [1, 100], 천원: [1, 100_000], 원: [1, 100_000_000],
};

function readRow(text: string, label: string, unit: [number, number]): number | null {
  const m = new RegExp(`${label}\\s*당해실적\\s*([△-]?\\d[\\d,]*(?:\\.\\d+)?|-)`).exec(text);
  if (!m || m[1] === "-") return null;
  const negative = /^[△-]/.test(m[1]);
  const n = Number(m[1].replace(/[△,-]/g, ""));
  const v = (n * unit[0]) / unit[1];
  return Math.round((negative ? -v : v) * 100) / 100;
}

/** 실적기간을 찾지 못하면 null. 값이 "-"인 항목은 null. */
export function parsePreliminaryResult(text: string): PreliminaryResult | null {
  const range = /당기실적\s*\d{4}-\d{2}-\d{2}\s*~\s*(\d{4})-(\d{2})-\d{2}/.exec(text);
  // 옛 양식: 표 머리의 첫 분기 표기가 당기. ('25.2Q) 또는 2025년 2분기
  const short = /\('?(\d{2})\.(\d)Q\)/.exec(text);
  const long = /당기실적[\s\S]{0,80}?(\d{4})년\s*(\d)분기/.exec(text);
  const period = range
    ? `${range[1]}-Q${Math.ceil(Number(range[2]) / 3)}`
    : short ? `20${short[1]}-Q${short[2]}` : long ? `${long[1]}-Q${long[2]}` : null;
  if (!period) return null;
  const unitName = /단위\s*:\s*(조원|억원|백만원|천원|원)/.exec(text)?.[1] ?? "백만원";
  const unit = UNIT[unitName];
  return {
    period,
    revenue: readRow(text, "매출액", unit),
    opIncome: readRow(text, "영업이익", unit),
    netIncome: readRow(text, "당기순이익", unit),
  };
}

/** (실적 - 컨센서스 평균) / |평균| × 100. 어느 쪽이든 없으면 null. */
export function surprisePct(actual: number | null, avg: number | null): number | null {
  if (actual == null || avg == null || avg === 0) return null;
  return ((actual - avg) * 100) / Math.abs(avg);
}
