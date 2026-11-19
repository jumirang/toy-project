import { describe, expect, test } from "vitest";

import { extractConsensus, parseKoreanAmount } from "./extract";

describe("한국어 금액 표기를 억원 단위 숫자로 바꾼다 (AC8a)", () => {
  test.each([
    ["10조4천억 원", 104_000],
    ["1조 2,300억원", 12_300],
    ["5212억원", 5_212],
    ["122조9천466억원", 1_229_466],
    ["129조3천358억원", 1_293_358],
    ["3조6천억원", 36_000],
    ["45조원", 450_000],
    ["1,590억 원", 1_590],
  ])("%s → %d억원", (text, expected) => {
    expect(parseKoreanAmount(text)).toBe(expected);
  });

  test("금액이 아닌 문자열은 null", () => {
    expect(parseKoreanAmount("5.2% 상향")).toBeNull();
  });
});

describe("뉴스 요약문에서 대상 분기의 컨센서스 평균을 뽑는다 (AC8a)", () => {
  test("전망치가 'A에서 B로' 바뀌었으면 바뀐 뒤 값을 쓴다", () => {
    const text = "삼성전자의 4분기 영업이익 전망치는 122조9천466억원에서 129조3천358억원으로 5.2% 상향됐다";
    expect(extractConsensus(text, 4)).toEqual({ op: 1_293_358 });
  });

  test("한 문장에 매출액과 영업이익 컨센서스가 함께 있으면 둘 다 뽑는다", () => {
    const text = "증권가에 따르면 3분기 매출액 컨센서스는 86조원, 영업이익은 10조4천억원으로 집계됐다.";
    expect(extractConsensus(text, 3)).toEqual({ rev: 860_000, op: 104_000 });
  });

  test("실적과 컨센서스가 한 문장에 있으면 컨센서스 쪽 금액을 쓴다", () => {
    const text = "네이버의 3분기 영업이익은 5301억원으로 시장 전망치(컨센서스)인 5212억원을 웃돌았다.";
    expect(extractConsensus(text, 3)).toEqual({ op: 5_212 });
  });

  test("'영업익' 줄임말과 순이익도 알아본다", () => {
    const text = "카카오 3분기 영업익 컨센서스 1590억원, 순이익 추정치 870억원";
    expect(extractConsensus(text, 3)).toEqual({ op: 1_590, net: 870 });
  });

  test("금액이 없으면 값을 내지 않는다", () => {
    const text = "7%)의 4분기 영업이익 컨센서스(증권사 전망치 평균)가 3개월 전보다 하향 조정됐다";
    expect(extractConsensus(text, 4)).toEqual({});
  });

  test("다른 분기의 컨센서스는 쓰지 않는다", () => {
    const text = "3분기 영업이익 컨센서스는 10조4천억원이다.";
    expect(extractConsensus(text, 4)).toEqual({});
  });

  test("컨센서스를 뜻하는 말이 없는 실적 숫자는 쓰지 않는다", () => {
    const text = "삼성전자는 3분기 영업이익이 12조1655억원을 기록했다고 밝혔다.";
    expect(extractConsensus(text, 3)).toEqual({});
  });

  test("분기를 말하지 않는 연간 컨센서스는 쓰지 않는다", () => {
    const text = "올해 연간 영업이익 컨센서스는 45조원 수준이다.";
    expect(extractConsensus(text, 4)).toEqual({});
  });

  test("'매출액과 영업이익 … 각각 A, B'는 순서대로 나눠 담는다 (실제 기사에서 재현한 버그)", () => {
    const text =
      "3일 금융정보업체 에프앤가이드에 따르면 네이버(NAVER)의 올해 3분기 연결기준 매출액과 영업이익 전망치(컨센서스)는 각각 3조5143억원, 4976억원이다.";
    expect(extractConsensus(text, 3)).toEqual({ rev: 35_143, op: 4_976 });
  });

  test("기업 이름을 주면 그 이름이 들어간 문장만 본다 (두 회사를 함께 다룬 기사)", () => {
    const text = "네이버의 3분기 영업이익 컨센서스는 4976억원이다. 카카오의 3분기 영업이익 컨센서스는 1590억원이다.";
    expect(extractConsensus(text, 3, ["카카오"])).toEqual({ op: 1_590 });
    expect(extractConsensus(text, 3, ["NAVER", "네이버"])).toEqual({ op: 4_976 });
  });

  test("항목으로 시작하는 바로 다음 문장은 앞 문장의 분기·컨센서스를 이어받는다 (실제 기사)", () => {
    const text =
      "금융정보업체 에프앤가이드에 따르면 네이버의 올해 1분기 매출 컨센서스는 3조1443억원으로 전년 동기 대비 12.8% 증가할 것으로 예상된다. 영업이익은 5593억원으로 10.6% 늘어날 전망이다.";
    expect(extractConsensus(text, 1, ["네이버"])).toEqual({ rev: 31_443, op: 5_593 });
  });

  test("이어받는 문장이라도 다른 분기를 말하면 쓰지 않는다", () => {
    const text = "네이버의 1분기 매출 컨센서스는 3조1443억원이다. 영업이익은 지난해 4분기 5420억원보다 줄 전망이다.";
    expect(extractConsensus(text, 1, ["네이버"])).toEqual({ rev: 31_443 });
  });

  test("문장이 나뉘어 있으면 대상 분기가 있는 문장만 본다", () => {
    const text = "3분기 영업이익 컨센서스는 10조원이었다. 4분기 영업이익 컨센서스는 13조1천억원이다.";
    expect(extractConsensus(text, 4)).toEqual({ op: 131_000 });
  });
});
