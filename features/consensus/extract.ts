// 뉴스 요약문에서 분기 컨센서스 평균을 규칙으로 뽑는다. LLM 없이, 패턴에 맞을 때만 값을 낸다.

export type ConsensusItem = "rev" | "op" | "net";

// "10조4천억 원", "1조 2,300억원", "5212억원", "45조원" 같은 금액. 조 또는 억 중 하나는 있어야 한다.
const AMOUNT_RE = /(?:(\d[\d,]*(?:\.\d+)?)\s*조\s*)?(?:([\d,천백십]*\d[\d,천백십]*|\d*[천백십])\s*억\s*)?(?:[\d,]+\s*만\s*)?원/g;

// "9천466" → 9466, "4천" → 4000, "2,300" → 2300
function parseSmall(text: string): number {
  let total = 0;
  let digits = "";
  for (const ch of text.replace(/,/g, "")) {
    if (/\d/.test(ch)) {
      digits += ch;
      continue;
    }
    const unit = ch === "천" ? 1000 : ch === "백" ? 100 : ch === "십" ? 10 : 0;
    if (unit) {
      total += (digits ? Number(digits) : 1) * unit;
      digits = "";
    }
  }
  return total + (digits ? Number(digits) : 0);
}

type Amount = { value: number; start: number; end: number };

function findAmounts(text: string): Amount[] {
  const out: Amount[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const [whole, jo, eok] = m;
    if (!jo && !eok) continue;
    const value = (jo ? Number(jo.replace(/,/g, "")) * 10_000 : 0) + (eok ? parseSmall(eok) : 0);
    out.push({ value: Math.round(value * 100) / 100, start: m.index, end: m.index + whole.length });
  }
  return out;
}

/** 한국어 금액 표기를 억원 단위 숫자로 바꾼다. 금액이 없으면 null. */
export function parseKoreanAmount(text: string): number | null {
  return findAmounts(text)[0]?.value ?? null;
}

const ITEM_RE = /당기순이익|순이익|매출액|매출|영업이익|영업익/g;
const ITEM_OF: Record<string, ConsensusItem> = {
  매출액: "rev", 매출: "rev", 영업이익: "op", 영업익: "op", 당기순이익: "net", 순이익: "net",
};
const CONSENSUS_RE = /컨센서스|전망치|추정치|예상치|시장\s*전망|시장\s*기대/;

function clean(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * 한 문장 안에 대상 분기, 항목, 컨센서스를 뜻하는 말, 금액이 함께 있을 때만 값을 낸다.
 * "A에서 B로" 바뀐 전망치는 B를 쓴다.
 */
export function extractConsensus(text: string, quarter: number, names?: string[]): Partial<Record<ConsensusItem, number>> {
  const result: Partial<Record<ConsensusItem, number>> = {};
  const quarterRe = new RegExp(`(?<!\\d)${quarter}\\s*분기|(?<!\\d)${quarter}Q`);
  const raw = clean(text).split(/\.{3}|…|(?<=[가-힣)])\.(?:\s|$)|\n/);
  // 항목으로 시작하고 다른 분기를 말하지 않는 문장은 앞 문장에 이어 붙인다 ("…컨센서스는 A. 영업이익은 B로…")
  const sentences: string[] = [];
  for (const s of raw) {
    const continues = sentences.length && /^\s*(매출액|매출|영업이익|영업익|당기순이익|순이익)/.test(s) && !/\d\s*분기|\dQ/.test(s);
    if (continues) sentences[sentences.length - 1] += `, ${s.trim()}`;
    else sentences.push(s);
  }

  for (const sentence of sentences) {
    if (!quarterRe.test(sentence)) continue;
    if (names?.length && !names.some((n) => sentence.includes(n))) continue;
    const items = [...sentence.matchAll(ITEM_RE)];
    for (let i = 0; i < items.length; i++) {
      // "매출액과 영업이익 … 각각 A, B": 접속어로만 이어진 항목을 한 묶음으로 본다
      const group = [ITEM_OF[items[i][0]]];
      while (items[i + 1] && /^[\s과와및,·]*$/.test(sentence.slice(items[i].index + items[i][0].length, items[i + 1].index))) {
        group.push(ITEM_OF[items[++i][0]]);
      }
      const segStart = items[i].index + items[i][0].length;
      const segment = sentence.slice(segStart, items[i + 1]?.index ?? sentence.length);

      let area: string;
      const kw = CONSENSUS_RE.exec(segment);
      if (kw) area = segment.slice(kw.index + kw[0].length);
      else if (CONSENSUS_RE.test(sentence.slice(0, items[i].index))) area = segment;
      else continue;

      const amounts = findAmounts(area);
      if (group.length > 1) {
        if (amounts.length < group.length) continue;
        group.forEach((item, k) => (result[item] ??= amounts[k].value));
        continue;
      }
      if (!amounts.length || result[group[0]] !== undefined) continue;
      const changed = amounts.length > 1 && /에서/.test(area.slice(amounts[0].end, amounts[1].start));
      result[group[0]] = changed ? amounts[1].value : amounts[0].value;
    }
  }
  return result;
}
