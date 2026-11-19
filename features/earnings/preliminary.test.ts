import { describe, expect, test } from "vitest";

import { parsePreliminaryResult, surprisePct } from "./preliminary";

describe("잠정실적 공시 원문에서 당해 분기 실적을 억원으로 읽는다 (AC6)", () => {
  test("억원 단위 공시", () => {
    const text =
      "연결재무제표 기준 영업(잠정)실적(공정공시) 실적기간 당기실적 2026-07-01 ~ 2026-09-30 전기실적 2026-04-01 ~ 2026-06-30 " +
      "1. 연결실적내용 단위 : 억원, % 구분 당기실적 전기실적 ('26.3Q) ('26.2Q) " +
      "매출액 당해실적 1,952,532 1,714,995 13.85 - 860,617 126.88 - 누계실적 5,006,261 - - " +
      "영업이익 당해실적 1,074,405 894,924 20.06 - 121,661 783.11 - 누계실적 2,541,657 " +
      "법인세비용차감전계속사업이익 당해실적 985,322 944,398 " +
      "당기순이익 당해실적 751,361 716,245 4.90 - 122,257 누계실적 1,939,859 " +
      "지배기업 소유주지분 순이익 당해실적 752,081 712,695";
    expect(parsePreliminaryResult(text)).toEqual({ period: "2026-Q3", revenue: 1_952_532, opIncome: 1_074_405, netIncome: 751_361 });
  });

  test("조원 단위이고 순이익이 비어 있는 공시", () => {
    const text =
      "실적기간 당기실적 2026-07-01 ~ 2026-09-30 단위 : 조원, % 구분 당기실적 " +
      "매출액 당해실적 195.00 171.50 13.70 영업이익 당해실적 107.40 89.49 " +
      "법인세비용차감전계속사업이익 당해실적 - - 당기순이익 당해실적 - - - 지배기업 소유주지분 순이익 당해실적 - -";
    expect(parsePreliminaryResult(text)).toEqual({ period: "2026-Q3", revenue: 1_950_000, opIncome: 1_074_000, netIncome: null });
  });

  test("백만원 단위와 4분기, 적자(음수) 순이익", () => {
    const text =
      "실적기간 당기실적 2025-10-01 ~ 2025-12-31 단위 : 백만원, % " +
      "매출액 당해실적 1,234,567 영업이익 당해실적 -45,600 당기순이익 당해실적 △21,200";
    expect(parsePreliminaryResult(text)).toEqual({ period: "2025-Q4", revenue: 12_345.67, opIncome: -456, netIncome: -212 });
  });

  test("실적기간 줄이 없는 옛 양식은 표 머리의 ('25.2Q) 표기로 분기를 읽는다 (실제 공시에서 재현)", () => {
    const text =
      "연결재무제표 기준 영업(잠정)실적(공정공시) ※ 동 정보는 잠정치로서 향후 확정치와는 다를 수 있음. 1. 연결실적내용 단위 : 억원, % " +
      "구분 당기실적 전기실적 전기대비증감율(%) 전년동기실적 전년동기대비증감율(%) ('25.2Q) ('25.1Q) ('24.2Q) " +
      "매출액 당해실적 29,151 27,868 4.6 26,105 11.7 누계실적 57,019 영업이익 당해실적 5,216 5,053 3.2 " +
      "당기순이익 당해실적 4,974 4,237 17.4";
    expect(parsePreliminaryResult(text)).toEqual({ period: "2025-Q2", revenue: 29_151, opIncome: 5_216, netIncome: 4_974 });
  });

  test.each([
    ["2025년 2분기 2025년 1분기 2024년 2분기", "카카오"],
    ["(2025년 2분기) (2025년 1분기) (2024년 2분기)", "SK하이닉스"],
  ])("표 머리가 '%s' 형식인 옛 양식 (%s 공시에서 재현)", (header) => {
    const text =
      `1. 연결실적내용 단위 : 백만원, % 구분 당기실적 전기실적 전기대비증감율(%) 전년동기실적 전년동기대비증감율(%) ${header} ` +
      "매출액 당해실적 2,028,313 1,863,731 +8.8 영업이익 당해실적 185,926 105,401 당기순이익 당해실적 171,815 200,334";
    expect(parsePreliminaryResult(text)).toEqual({ period: "2025-Q2", revenue: 20_283.13, opIncome: 1_859.26, netIncome: 1_718.15 });
  });

  test("실적기간을 찾을 수 없으면 null", () => {
    expect(parsePreliminaryResult("기업설명회(IR) 개최(안내공시)")).toBeNull();
  });
});

describe("실적과 컨센서스 평균의 차이 비율 (AC7)", () => {
  test("(실적 - 평균) / |평균| × 100", () => {
    expect(surprisePct(110, 100)).toBe(10);
    expect(surprisePct(50, -100)).toBe(150);
    expect(surprisePct(-212, 870)).toBeCloseTo(-124.37, 2);
  });

  test("컨센서스 평균이나 실적이 없으면 null", () => {
    expect(surprisePct(110, null)).toBeNull();
    expect(surprisePct(null, 100)).toBeNull();
    expect(surprisePct(110, 0)).toBeNull();
  });
});
