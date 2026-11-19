"use client";
// 관심 기업 관리: 기업명·종목코드로 검색해 추가, 목록에서 삭제.
import { StarIcon } from "@phosphor-icons/react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addCompany, removeCompany, searchCorps } from "@/app/actions";

export function WatchlistDialog({ companies, open, onOpenChange }: {
  companies: { stockCode: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ stock_code: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, start] = useTransition();
  const watched = new Set(companies.map((c) => c.stockCode));

  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setHits(await searchCorps(query));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline"><StarIcon weight="fill" />관심 기업 관리</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>관심 기업 관리</DialogTitle>
          <DialogDescription>10개 안팎을 권장합니다. 추가한 기업은 다음 갱신 때 실적과 뉴스를 가져옵니다.</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="기업명 또는 종목코드 (예: 셀트리온, 068270)" aria-label="기업 검색" />
        {query.trim() && (
          <div className="overflow-hidden rounded-lg border">
            {searching && hits.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">찾는 중… (처음 한 번은 상장사 목록을 받느라 몇 초 걸립니다)</p>}
            {!searching && hits.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">일치하는 상장사가 없습니다.</p>}
            {hits.map((h) => (
              <button
                key={h.stock_code}
                type="button"
                disabled={watched.has(h.stock_code) || pending}
                onClick={() => start(async () => { await addCompany(h.stock_code); setQuery(""); setHits([]); })}
                className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
              >
                <span>{h.name}</span>
                <span className="text-muted-foreground tabular-nums">{h.stock_code} {watched.has(h.stock_code) ? "추가됨" : "추가"}</span>
              </button>
            ))}
          </div>
        )}
        <ul className="max-h-72 overflow-y-auto">
          {companies.length === 0 && <li className="py-2 text-center text-sm text-muted-foreground">관심 기업이 없습니다</li>}
          {companies.map((c) => (
            <li key={c.stockCode} className="flex items-center justify-between border-b py-1.5 text-sm last:border-b-0">
              <span><b>{c.name}</b> <span className="text-muted-foreground tabular-nums">{c.stockCode}</span></span>
              <Button size="xs" variant="ghost" disabled={pending} onClick={() => start(() => removeCompany(c.stockCode))}>삭제</Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
