"use client";
// 발표 후 일별 주가: 발표 전날 종가를 기준선으로 두고 이후 종가를 선으로 그린다.
// 마우스를 올리면 그날 종가와 변동률을, 누르면 그날을 골라 아래에 고정해 보여 준다.
import { useRef, useState } from "react";

import type { Close } from "@/features/market/metrics";

import { md, pct, tone, won } from "./format";

const W = 640, H = 200, L = 8, R = 64, T = 10, B = 24;
const change = (from: number, to: number) => ((to - from) * 100) / from;

export function PriceSinceChart({ closes, announcedOn }: { closes: Close[]; announcedOn: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const prevIdx = closes.findLastIndex((c) => c.date < announcedOn);
  const series = prevIdx >= 0 ? closes.slice(prevIdx) : [];
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  if (series.length < 2) return <p className="text-sm text-muted-foreground">발표 후 주가 데이터가 없습니다. 갱신하면 채워집니다.</p>;

  const base = series[0];
  const n = series.length;
  const prices = series.map((s) => s.close);
  const pad = (Math.max(...prices) - Math.min(...prices)) * 0.1 || base.close * 0.05;
  const ymax = Math.max(...prices) + pad;
  const ymin = Math.min(...prices) - pad;
  const x = (i: number) => L + ((W - L - R) * i) / (n - 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - ymin) / (ymax - ymin));
  const d = series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.close).toFixed(1)}`).join("");
  const sel = picked ?? n - 1;
  const at = (e: React.MouseEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return Math.max(1, Math.min(n - 1, Math.round(((p.x - L) / (W - L - R)) * (n - 1))));
  };
  const ticks = [1, Math.round(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div>
      <div className="relative">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="발표 후 일별 주가 차트">
          <line x1={L} x2={W - R} y1={y(base.close)} y2={y(base.close)} className="stroke-muted-foreground" strokeDasharray="4 3" />
          <text x={W - R + 6} y={y(base.close) + 4} fontSize={10} className="fill-muted-foreground">전날 {won(base.close)}</text>
          <path d={d} fill="none" className="stroke-foreground" strokeWidth={2} strokeLinejoin="round" />
          {ticks.map((i) => (
            <text key={i} x={x(i)} y={H - 6} fontSize={10} textAnchor={i === n - 1 ? "end" : "middle"} className="fill-muted-foreground">{md(series[i].date)}</text>
          ))}
          <line x1={x(sel)} x2={x(sel)} y1={T} y2={H - B} className="stroke-primary" />
          <circle cx={x(sel)} cy={y(series[sel].close)} r={4} className="fill-primary stroke-card" strokeWidth={2} />
          {hover != null && hover !== sel && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="stroke-muted-foreground" strokeDasharray="3 3" />}
          <rect
            x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" className="cursor-pointer"
            onMouseMove={(e) => setHover(at(e))} onMouseLeave={() => setHover(null)} onClick={(e) => setPicked(at(e))}
          />
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
            style={{ left: `min(calc(${(x(hover) / W) * 100}% + 12px), calc(100% - 140px))` }}
          >
            <b>{md(series[hover].date)}</b> (+{hover}거래일)
            <br />종가 <b className="tabular-nums">{won(series[hover].close)}원</b>
            <br />변동률 <b className={`tabular-nums ${tone(change(base.close, series[hover].close))}`}>{pct(change(base.close, series[hover].close))}</b>
          </div>
        )}
      </div>
      <p className="mt-1 text-sm tabular-nums">
        발표 전날 종가 <b>{won(base.close)}원</b> → {picked == null ? `현재(${md(series[sel].date)})` : md(series[sel].date)} · +{sel}거래일 <b>{won(series[sel].close)}원</b>{" "}
        <b className={tone(change(base.close, series[sel].close))}>{pct(change(base.close, series[sel].close))}</b>
      </p>
      <p className="text-[11px] text-muted-foreground">차트에서 날짜를 누르면 그날 기준 변동률을 보여 줍니다.</p>
    </div>
  );
}
