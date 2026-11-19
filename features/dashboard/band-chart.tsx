"use client";
// PER/PBR 밴드 시계열: 월말 주가 선 + 배수별 밴드 선 5개, 마우스 오버 툴팁.
import { useRef, useState } from "react";

import type { Band } from "./load";

const W = 640, H = 260, L = 8, R = 64, T = 10, B = 24;
const TONES = ["oklch(0.86 0.07 150)", "oklch(0.77 0.10 150)", "oklch(0.67 0.13 150)", "oklch(0.57 0.14 150)", "oklch(0.46 0.12 150)"];

export function BandChart({ band, kind }: { band: Band; kind: "PER" | "PBR" }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { points, levels } = band;
  if (!levels || points.length < 2) return null;

  const n = points.length;
  const perShare = points.map((p) => (p.multiple ? p.price / p.multiple : null));
  const bands = levels.map((m) => perShare.map((ps) => (ps == null ? null : ps * m)));
  const prices = points.map((p) => p.price);
  // 세로축은 주가 범위에 맞춘다. 일회성 이익 등으로 튀는 밴드 선은 범위 밖에서 잘린다.
  const ymax = Math.max(...prices) * 1.5;
  const ymin = Math.min(...prices) * 0.6;
  const x = (i: number) => L + ((W - L - R) * i) / (n - 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - ymin) / (ymax - ymin));
  const path = (arr: (number | null)[]) => {
    let d = "";
    let pen = false;
    arr.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const digits = kind === "PBR" ? 2 : 1;
  const ticks = [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1];

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    setHover(Math.max(0, Math.min(n - 1, Math.round(((p.x - L) / (W - L - R)) * (n - 1)))));
  };

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${kind} 밴드 차트`}>
        <defs><clipPath id={`plot-${kind}`}><rect x={L} y={T} width={W - L - R} height={H - T - B} /></clipPath></defs>
        {[0.25, 0.5, 0.75].map((f) => {
          const v = ymin + (ymax - ymin) * f;
          return (
            <g key={f}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-border" />
              <text x={W - R + 6} y={y(v) + 4} fontSize={10} className="fill-muted-foreground">{Math.round(v).toLocaleString("ko-KR")}</text>
            </g>
          );
        })}
        <g clipPath={`url(#plot-${kind})`}>
          {bands.map((b, k) => <path key={k} d={path(b)} fill="none" stroke={TONES[k]} strokeWidth={2} strokeLinejoin="round" />)}
          <path d={path(prices)} fill="none" className="stroke-foreground" strokeWidth={2} strokeLinejoin="round" />
        </g>
        <circle cx={x(n - 1)} cy={y(prices[n - 1])} r={4} className="fill-foreground stroke-card" strokeWidth={2} />
        {bands.map((b, k) => {
          const v = b.at(-1);
          return v != null && v <= ymax && v >= ymin ? (
            <text key={k} x={W - R + 6} y={y(v) + 4} fontSize={10} fontWeight={600} className="fill-foreground">{levels[k].toFixed(digits)}배</text>
          ) : null;
        })}
        {ticks.map((i, j) => (
          <text key={j} x={x(i)} y={H - 6} fontSize={10} textAnchor={j === 0 ? "start" : j === ticks.length - 1 ? "end" : "middle"} className="fill-muted-foreground">
            {points[i].month.replace("-", ".")}
          </text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="stroke-muted-foreground" strokeDasharray="3 3" />}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
          style={{ left: `min(calc(${(x(hover) / W) * 100}% + 12px), calc(100% - 150px))` }}
        >
          <b>{points[hover].month.replace("-", ".")}</b>
          <br />주가 <b className="tabular-nums">{points[hover].price.toLocaleString("ko-KR")}원</b>
          <br />{kind} <b className="tabular-nums">{points[hover].multiple == null ? "—" : `${points[hover].multiple!.toFixed(digits)}배`}</b>
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><i className="inline-block h-0.5 w-3.5 bg-foreground" />주가</span>
        {levels.map((m, k) => (
          <span key={k} className="flex items-center gap-1"><i className="inline-block h-0.5 w-3.5" style={{ background: TONES[k] }} />{kind} {m.toFixed(digits)}배</span>
        ))}
      </div>
    </div>
  );
}
