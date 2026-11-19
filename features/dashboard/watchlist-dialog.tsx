"use client";
// 관심 기업 관리: 받아 둔 국내 상장사 목록에서 검색해 추가(없으면 DART에서 다시 찾음)와 삭제.
// 한 번도 갱신된 적 없는 기업을 추가하면 바로 첫 갱신을 돌린다. 그 뒤 갱신은 상세 머리의 갱신 버튼이 맡는다.
import { StarIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addCompany, listCorps, removeCompany, searchCorpsExternal } from "@/app/actions";
import { cn } from "@/lib/utils";

import { useRefreshStream } from "./use-refresh-stream";

type Corp = { stock_code: string; name: string };
type WatchedCompany = { stockCode: string; name: string; refreshedAt: string | null; refreshError: string | null };

const stamp = (iso: string | null) => {
  if (!iso) return "아직 갱신 전";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 갱신`;
};

export function WatchlistDialog({ companies, open, onOpenChange, disabled }: {
  companies: WatchedCompany[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean; // 전체 갱신 중
}) {
  const [corps, setCorps] = useState<Corp[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [external, setExternal] = useState<{ query: string; hits: Corp[] | null } | null>(null);
  const [pending, start] = useTransition();
  const { refresh, running, error } = useRefreshStream();
  const watched = new Set(companies.map((c) => c.stockCode));
  const q = query.trim().toLowerCase();

  // 대화상자를 열면 국내 상장사 전체 목록을 한 번 받아 둔다.
  useEffect(() => {
    if (!open || corps) return;
    listCorps().then(setCorps, (e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [open, corps]);

  const localHits = useMemo(
    () => (q && corps ? corps.filter((c) => c.name.toLowerCase().includes(q) || c.stock_code.startsWith(q)).slice(0, 8) : []),
    [q, corps],
  );

  // 받아 둔 목록에 없으면 그때 DART에서 다시 찾는다.
  const needExternal = !!q && !!corps && localHits.length === 0;
  useEffect(() => {
    if (!needExternal) return;
    const t = setTimeout(async () => {
      setExternal({ query: q, hits: null });
      const hits = await searchCorpsExternal(q);
      setExternal({ query: q, hits });
      if (hits.length) setCorps(null); // 새로 받은 목록으로 다시 채운다
    }, 500);
    return () => clearTimeout(t);
  }, [needExternal, q]);

  const ext = external?.query === q ? external : null;
  const hits = localHits.length ? localHits : (ext?.hits ?? []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline"><StarIcon weight="fill" />관심 기업 관리</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>관심 기업 관리</DialogTitle>
          <DialogDescription>10개 안팎을 권장합니다. 처음 추가하는 기업은 바로 데이터를 가져오고, 이후에는 상세 화면의 갱신 버튼이나 전체 갱신으로 최신화합니다.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={corps ? `기업명 또는 종목코드 (국내 상장사 ${corps.length.toLocaleString("ko-KR")}곳)` : "상장사 목록을 받는 중…"}
          aria-label="기업 검색"
        />
        {loadError && <p className="text-sm text-destructive">상장사 목록을 받지 못했습니다: {loadError}</p>}
        {q && (
          <div className="overflow-hidden rounded-lg border">
            {!corps && <p className="px-3 py-2 text-sm text-muted-foreground">상장사 목록을 받는 중…</p>}
            {needExternal && !ext?.hits && <p className="px-3 py-2 text-sm text-muted-foreground">받아 둔 목록에 없어 DART에서 다시 찾는 중…</p>}
            {needExternal && ext?.hits?.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">DART에서도 일치하는 상장사를 찾지 못했습니다.</p>}
            {hits.map((h) => (
              <button
                key={h.stock_code}
                type="button"
                disabled={watched.has(h.stock_code) || pending}
                onClick={() => start(async () => {
                  const { needsRefresh } = await addCompany(h.stock_code);
                  setQuery("");
                  if (needsRefresh) void refresh(h.stock_code);
                })}
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
            <li key={c.stockCode} className="flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-b-0">
              <span className="min-w-0">
                <b>{c.name}</b> <span className="text-muted-foreground tabular-nums">{c.stockCode}</span>
                {running?.code === c.stockCode ? (
                  <span className="block text-xs text-primary">첫 갱신: {running.stage}…</span>
                ) : (
                  <span className={cn("block text-xs", c.refreshError || error?.code === c.stockCode ? "text-destructive" : "text-muted-foreground")}>
                    {error?.code === c.stockCode ? `갱신 실패: ${error.message}` : c.refreshError ? `갱신 실패: ${c.refreshError}` : stamp(c.refreshedAt)}
                  </span>
                )}
              </span>
              <Button size="xs" variant="ghost" disabled={disabled || pending || running?.code === c.stockCode} onClick={() => start(() => removeCompany(c.stockCode))}>삭제</Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
