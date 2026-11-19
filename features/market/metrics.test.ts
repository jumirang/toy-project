import { describe, expect, test } from "vitest";

import { bandSeries, priceChange, reactions, type Close } from "./metrics";

// 2026-10-08(목) 발표. 10-03~10-05 휴장 가정, 주말 없음.
const closes: Close[] = [
  { date: "2026-10-01", close: 90_000 },
  { date: "2026-10-02", close: 100_000 }, // 발표 전날(직전 거래일)
  { date: "2026-10-08", close: 103_000 }, // +1
  { date: "2026-10-09", close: 101_000 }, // +2
  { date: "2026-10-12", close: 110_000 }, // +3
  { date: "2026-10-13", close: 95_000 }, // +4
];

describe("발표 후 주가 변동률 (AC10)", () => {
  test("발표 전날 종가 대비 가장 최근 종가", () => {
    expect(priceChange(closes, "2026-10-08")).toEqual({ prevClose: 100_000, refClose: 95_000, refDate: "2026-10-13", pct: -5 });
  });

  test("기준일이 휴장일이면 직전 거래일 종가", () => {
    expect(priceChange(closes, "2026-10-08", "2026-10-11")).toEqual({ prevClose: 100_000, refClose: 101_000, refDate: "2026-10-09", pct: 1 });
  });

  test("발표 전 종가가 없으면 null", () => {
    expect(priceChange(closes, "2026-10-01")).toBeNull();
  });
});

describe("과거 발표별 +N거래일 반응 (AC11)", () => {
  test("발표일을 첫 거래일로 센 N번째 거래일의 날짜·종가·변동률과 기준 주가", () => {
    const r = reactions(closes, "2026-10-08", [1, 3]);
    expect(r.base).toEqual({ prevDate: "2026-10-02", prevClose: 100_000, dayDate: "2026-10-08", dayClose: 103_000 });
    expect(r.cells).toEqual({
      1: { date: "2026-10-08", close: 103_000, pct: 3, reached: true },
      3: { date: "2026-10-12", close: 110_000, pct: 10, reached: true },
    });
  });

  test("아직 오지 않은 첫 칸은 현재(가장 최근 거래일) 기준, 그 뒤 칸은 null", () => {
    expect(reactions(closes, "2026-10-08", [3, 5, 6]).cells).toEqual({
      3: { date: "2026-10-12", close: 110_000, pct: 10, reached: true },
      5: { date: "2026-10-13", close: 95_000, pct: -5, reached: false },
      6: null,
    });
  });

  test("발표 전 종가가 없으면 기준과 칸이 모두 비어 있다", () => {
    expect(reactions(closes, "2026-10-01", [1])).toEqual({ base: null, cells: { 1: null } });
  });
});

describe("PER/PBR 밴드 (AC12)", () => {
  // 2021-12 ~ 2026-11 매월 말 하루씩, 주당 값 1,000원 고정, 주가로 배수가 정해진다.
  const monthly: Close[] = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2021, 11 + i, 28));
    monthly.push({ date: d.toISOString().slice(0, 10), close: 10_000 + i * 100 });
  }
  // 같은 달 중간 값은 월말 값에 묻혀야 한다.
  const daily: Close[] = [{ date: "2026-11-02", close: 1 }, ...monthly].sort((a, b) => a.date.localeCompare(b.date));

  test("월말 종가로 60개 점을 만들고, 배수 최저–최고를 4등분한 5개 밴드와 현재 위치를 낸다", () => {
    const r = bandSeries(daily, () => 1_000);
    expect(r.points).toHaveLength(60);
    expect(r.points[0]).toEqual({ month: "2021-12", price: 10_000, multiple: 10 });
    expect(r.points[59]).toEqual({ month: "2026-11", price: 15_900, multiple: 15.9 });
    expect(r.levels).toEqual([10, 11.475, 12.95, 14.425, 15.9]);
    expect(r.current).toBe(15.9);
    expect(r.position).toBe(100);
  });

  test("주당 값이 없거나 0 이하인 달은 배수를 비우고 밴드 계산에서 뺀다", () => {
    const r = bandSeries(daily, (date) => (date < "2024-01-01" ? null : date < "2025-01-01" ? -50 : 1_000));
    expect(r.points[0].multiple).toBeNull();
    expect(r.points.find((p) => p.month === "2024-06")?.multiple).toBeNull();
    expect(r.levels?.[0]).toBe(13.7); // 2025-01 첫 유효값: (10,000 + 37×100)/1,000
  });

  test("유효한 배수가 하나도 없으면 밴드 없음", () => {
    const r = bandSeries(daily, () => null);
    expect(r.levels).toBeNull();
    expect(r.position).toBeNull();
  });
});
