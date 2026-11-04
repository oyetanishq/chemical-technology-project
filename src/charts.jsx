import React, { useState, useRef } from 'react';
/** Line chart: series=[{name,color,pts:[[x,y]],dots?:bool}], marker=[x] draws the user's point. */
export function LineChart({ title, xLabel, yLabel = 'Percent (%)', series, marker, yMin, yMax, unit = '%', xUnit = '', xTicks }) {
  const W = 560, H = 300, L = 54, R = 16, T = 12, B = 44;
  const allX = series.flatMap((s) => s.pts.map((p) => p[0]));
  const x0 = Math.min(...allX), x1 = Math.max(...allX);
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y) => T + (1 - (y - yMin) / (yMax - yMin)) * (H - T - B);
  const yTicks = []; for (let t = yMin; t <= yMax; t += 10) yTicks.push(t);
  const [hover, setHover] = useState(null); const ref = useRef(null);
  const lines = series.filter((s) => !s.dots);
  const move = (e) => {
    const b = ref.current.getBoundingClientRect(); const px = ((e.clientX - b.left) / b.width) * W;
    const xv = x0 + ((px - L) / (W - L - R)) * (x1 - x0);
    const near = lines[0].pts.reduce((a, p) => (Math.abs(p[0] - xv) < Math.abs(a[0] - xv) ? p : a));
    setHover({ x: near[0], vals: lines.map((s) => [s.name, s.pts.find((p) => p[0] === near[0])?.[1]]), left: (sx(near[0]) / W) * 100, top: (sy(near[1]) / H) * 100 });
  };
  return (
    <div className="chart"><h3>{title}</h3>
      <div style={{ position: 'relative' }}>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onMouseMove={move} onMouseLeave={() => setHover(null)}>
          {yTicks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" /><text x={L - 8} y={sy(t) + 4} textAnchor="end" fontSize="12" fill="var(--ink2)">{Number(t.toFixed(1))}</text></g>)}
          {xTicks.map((t) => <text key={t} x={sx(t)} y={H - B + 18} textAnchor="middle" fontSize="12" fill="var(--ink2)">{Number(t.toFixed(2))}</text>)}
          <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--ink2)">{xLabel}</text>
          <text transform={`translate(13 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--ink2)">{yLabel}</text>
          {marker != null && marker >= x0 && marker <= x1 && <g><line x1={sx(marker)} x2={sx(marker)} y1={T} y2={H - B} stroke="var(--ink)" strokeDasharray="4 4" /><text x={sx(marker) + (sx(marker) > W - 110 ? -6 : 6)} y={H - B - 8} textAnchor={sx(marker) > W - 110 ? 'end' : 'start'} fontSize="12" fontWeight="600" fill="var(--ink)">Your input</text></g>}
          {lines.map((s) => <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={s.pts.map((p) => `${sx(p[0])},${sy(Math.max(yMin, p[1]))}`).join(' ')} />)}
          {series.filter((s) => s.dots).map((s) => s.pts.map((p) => <circle key={s.name + p[0]} cx={sx(p[0])} cy={sy(p[1])} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />))}
          {hover && <line x1={sx(hover.x)} x2={sx(hover.x)} y1={T} y2={H - B} stroke="var(--ink2)" />}
        </svg>
        {hover && <div className="tip" style={{ left: `${hover.left}%`, top: `${hover.top}%` }}><b>{Number(hover.x.toFixed(2))}{xUnit}</b>{hover.vals.map(([n, v]) => <div key={n}>{n}: {v?.toFixed(2)}{unit}</div>)}</div>}
      </div>
      <div className="legend">{series.map((s) => <span key={s.name}><i className={s.dots ? 'dot' : ''} style={{ background: s.color }} />{s.name}</span>)}</div>
    </div>
  );
}
export function Bars({ rows, unit = 'kW', color = 'var(--s1)' }) {
  const max = Math.max(...rows.map((r) => Math.abs(r[1])), 1e-9);
  return <div>{rows.map(([n, v]) => <div className="bar" key={n} title={`${n}: ${v.toFixed(2)} ${unit}`}><span>{n}</span><div className="t"><div className="f" style={{ width: `${(Math.abs(v) / max) * 100}%`, background: color }} /></div><span className="val">{v.toFixed(1)}</span></div>)}</div>;
}
