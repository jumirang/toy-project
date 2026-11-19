// 공공데이터포털 금융위원회_주식시세정보 V2. 전 거래일 종가 기준.
const URL_BASE = "https://apis.data.go.kr/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2";

export type DailyPrice = { trade_date: string; close: number; shares: number | null };

/** beginBasDt(YYYYMMDD) 이후 일별 종가. */
export async function fetchDailyPrices(stockCode: string, beginBasDt: string): Promise<DailyPrice[]> {
  const out: DailyPrice[] = [];
  for (let page = 1; page <= 10; page++) {
    const qs = new URLSearchParams({
      serviceKey: process.env.DATA_GO_KR_SERVICE_KEY!,
      resultType: "json",
      numOfRows: "1000",
      pageNo: String(page),
      likeSrtnCd: stockCode,
      beginBasDt,
    });
    const r = await fetch(`${URL_BASE}?${qs}`, { cache: "no-store" });
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error(`시세 조회 실패: ${text.slice(0, 120)}`);
    }
    const header = j.response?.header;
    if (header?.resultCode !== "00") throw new Error(`시세 조회 실패: ${header?.resultMsg ?? r.status}`);
    const body = j.response.body;
    const items = [].concat(body.items?.item ?? []) as Record<string, string>[];
    for (const it of items) {
      if (it.srtnCd !== stockCode) continue;
      const d = it.basDt;
      out.push({ trade_date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, close: Number(it.clpr), shares: it.lstgStCnt ? Number(it.lstgStCnt) : null });
    }
    if (page * 1000 >= Number(body.totalCount)) break;
  }
  return out;
}
