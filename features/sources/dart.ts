// DART OpenAPI 클라이언트. https://opendart.fss.or.kr/guide
import { strFromU8, unzipSync } from "fflate";

const BASE = "https://opendart.fss.or.kr/api";
const key = () => process.env.DART_API_KEY!;

async function getJson(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ crtfc_key: key(), ...params });
  const r = await fetch(`${BASE}/${path}?${qs}`, { cache: "no-store" });
  const j = await r.json();
  if (j.status !== "000" && j.status !== "013") throw new Error(`DART ${path}: ${j.status} ${j.message}`);
  return j; // 013 = 조회된 데이터 없음
}

async function getZip(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ crtfc_key: key(), ...params });
  const r = await fetch(`${BASE}/${path}?${qs}`, { cache: "no-store" });
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error(`DART ${path}: zip이 아닌 응답`);
  return unzipSync(buf);
}

function decode(data: Uint8Array): string {
  const utf = strFromU8(data);
  return /[가-힣]/.test(utf.slice(0, 4000)) ? utf : new TextDecoder("euc-kr").decode(data);
}

export type Corp = { corp_code: string; name: string; stock_code: string };

/** 상장 법인 목록 (corpCode.xml). */
export async function fetchListedCorps(): Promise<Corp[]> {
  const files = await getZip("corpCode.xml", {});
  const xml = decode(Object.values(files)[0]);
  const out: Corp[] = [];
  for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const get = (tag: string) => new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`).exec(m[1])?.[1] ?? "";
    const stock = get("stock_code");
    if (stock) out.push({ corp_code: get("corp_code"), name: get("corp_name"), stock_code: stock });
  }
  return out;
}

export async function fetchCompanyInfo(corpCode: string) {
  const j = await getJson("company.json", { corp_code: corpCode });
  const url = (u: string) => (u ? (u.startsWith("http") ? u : `https://${u}`) : null);
  return { name: j.stock_name || j.corp_name, homepage: url(j.hm_url), ir_url: url(j.ir_url), industry_code: j.induty_code || null };
}

export type Disclosure = { rcept_no: string; rcept_dt: string; report_nm: string };

/** 거래소 공시(I) 목록. 날짜는 YYYYMMDD. */
export async function listExchangeDisclosures(corpCode: string, bgn: string, end: string): Promise<Disclosure[]> {
  const out: Disclosure[] = [];
  for (let page = 1; page <= 10; page++) {
    const j = await getJson("list.json", { corp_code: corpCode, bgn_de: bgn, end_de: end, pblntf_ty: "I", page_no: String(page), page_count: "100" });
    for (const it of j.list ?? []) out.push({ rcept_no: it.rcept_no, rcept_dt: it.rcept_dt, report_nm: String(it.report_nm).trim() });
    if (!j.total_page || page >= j.total_page) break;
  }
  return out;
}

/** 공시 원문을 태그를 걷어 낸 텍스트로. */
export async function fetchDisclosureText(rceptNo: string): Promise<string> {
  const files = await getZip("document.xml", { rcept_no: rceptNo });
  return Object.values(files)
    .map(decode)
    .join(" ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

export type AccountRow = { account_nm: string; fs_div: string; thstrm_amount: string; thstrm_add_amount?: string };

/** 단일회사 주요계정. reprt_code: 11013 1분기, 11012 반기, 11014 3분기, 11011 사업보고서. */
export async function fetchMainAccounts(corpCode: string, year: number, reprtCode: string): Promise<AccountRow[]> {
  const j = await getJson("fnlttSinglAcnt.json", { corp_code: corpCode, bsns_year: String(year), reprt_code: reprtCode });
  return j.list ?? [];
}
