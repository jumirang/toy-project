// NAVER API HUB 뉴스 검색. https://api.ncloud-docs.com/docs/naver-api-hub-search-news
// 제목, 요약, 링크만 쓰고 기사 본문은 가져오지 않는다.

export type NewsItem = { title: string; description: string; url: string; pubDate: string };

const strip = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export async function searchNews(query: string, opts: { sort: "sim" | "date"; display?: number }): Promise<NewsItem[]> {
  const qs = new URLSearchParams({ query, display: String(opts.display ?? 100), sort: opts.sort });
  const r = await fetch(`https://naverapihub.apigw.ntruss.com/search/v1/news?${qs}`, {
    headers: { "X-NCP-APIGW-API-KEY-ID": process.env.NAVER_CLIENT_ID!, "X-NCP-APIGW-API-KEY": process.env.NAVER_CLIENT_SECRET! },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`뉴스 검색 실패: ${r.status}`);
  const j = await r.json();
  return (j.items ?? []).map((it: Record<string, string>) => ({
    title: strip(it.title),
    description: strip(it.description),
    url: it.originallink || it.link,
    pubDate: new Date(it.pubDate).toISOString(),
  }));
}
