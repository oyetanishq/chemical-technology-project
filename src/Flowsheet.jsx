import React from 'react';
const f1 = (v) => v.toFixed(1);
const U = ({ id, x, y, w = 112, h = 54, title, sub, sel, onSel }) => (
  <g className={`unit ${sel === id ? 'sel' : ''}`} role="button" tabIndex={0} aria-label={`${title}: ${sub}`} onClick={() => onSel(id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSel(id))}>
    <rect x={x} y={y} width={w} height={h} rx="7" /><text x={x + w / 2} y={y + 22}>{title}</text><text className="k" x={x + w / 2} y={y + 40}>{sub}</text>
  </g>);
const E = ({ d, c = 'var(--s1)' }) => <g><path className="edge" d={d} markerEnd="url(#arrow)" /><path className="flow" d={d} stroke={c} /></g>;
const L = ({ x, y, t, a = 'start' }) => <text className="lbl" x={x} y={y} textAnchor={a}>{t}</text>;
export default function Flowsheet({ r, sel, onSel, paused }) {
  const d = r.duties, s = r.byName;
  const co2 = 'var(--s4)', h2 = 'var(--s1)', w = 'var(--s3)', gas = 'var(--s2)';
  return (
    <div className={`pfd ${paused ? 'paused' : ''}`}><svg viewBox="0 0 1180 500" role="group" aria-label="Plant flowsheet">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--ink2)" /></marker></defs>
      <E d="M92 92 H176" c={w} /><E d="M288 76 H560" c={h2} /><E d="M672 76 H1046" c={h2} /><E d="M232 119 V226 H336" c={h2} />
      <E d="M92 253 H150" c={co2} /><E d="M262 253 H336" c={co2} /><E d="M408 253 H440" c={gas} /><E d="M536 253 H566" c={gas} /><E d="M662 253 H694" c={gas} /><E d="M806 253 H840" c={gas} /><E d="M936 253 H968" c={gas} /><E d="M1080 253 H1110" c={gas} />
      <E d="M888 280 V372" c={gas} /><E d="M840 396 H372 V280" c={gas} /><E d="M936 396 H1020" c={gas} />
      <E d="M750 280 V462 H126 V92" c={w} />
      <text className="term" x="10" y="88">Ice water</text><L x="10" y="104" t={`${f1(r.waterKgH)} kg/h`} />
      <text className="term" x="10" y="249">Mars CO₂</text><L x="10" y="265" t={`${f1(r.co2KgH)} kg/h`} />
      <text className="term" x="1050" y="72">Liquid O₂</text><L x="1050" y="90" t={`${f1(r.o2Kgh)} kg/h`} />
      <text className="term" x="1114" y="249">LCH₄</text><L x="1114" y="265" t={`${f1(r.ch4Kgh)} kg/h`} />
      <text className="term" x="1026" y="392">Purge</text><L x="1026" y="408" t={`${r.purgeKgH.toFixed(3)} kg/h`} />
      <L x="300" y="66" t={`O₂ ${f1(r.o2Kgh)} kg/h`} /><L x="240" y="176" t={`H₂ ${f1(s.H2.kgh)} kg/h`} /><L x="600" y="388" t={`Recycle gas ${f1(s['RCY-GAS-IN'].kgh)} kg/h`} /><L x="420" y="454" t={`Recycled water ${f1(s['WATER-RCY'].kgh)} kg/h`} />
      <U id="electrolyser" x={176} y={65} title="Electrolyser" sub={`${f1(d.qElec)} kW`} sel={sel} onSel={onSel} />
      <U id="liquefier" x={560} y={49} title="O₂ liquefier" sub={`${f1(d.qLox + d.qO2Pre)} kW`} sel={sel} onSel={onSel} />
      <U id="compressor" x={150} y={226} title={`${r.p.stages}-stage comp.`} sub={`${f1(d.qComp)} kW`} sel={sel} onSel={onSel} />
      <U id="mixer" x={336} y={226} w={72} title="Mixer" sub={`${r.Tmix.toFixed(0)} °C`} sel={sel} onSel={onSel} />
      <U id="preheater" x={440} y={226} w={96} title="Preheater" sub={`${f1(d.qPreheat)} kW`} sel={sel} onSel={onSel} />
      <U id="reactor" x={566} y={226} w={96} title="Sabatier" sub={`${f1(d.qRx)} kW`} sel={sel} onSel={onSel} />
      <U id="cooler" x={694} y={226} title="Cooler + KO" sub={`${f1(d.qCool)} kW`} sel={sel} onSel={onSel} />
      <U id="separator" x={840} y={226} w={96} title="Gas sep." sub="ideal split" sel={sel} onSel={onSel} />
      <U id="cryo" x={968} y={226} title="Cryo-cooler" sub={`${f1(d.qCryo)} kW`} sel={sel} onSel={onSel} />
      <U id="purge" x={840} y={372} w={96} h={48} title="Purge split" sub={`${r.p.purge}%`} sel={sel} onSel={onSel} />
    </svg></div>);
}
