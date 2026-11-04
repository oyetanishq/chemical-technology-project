import React, { useEffect, useMemo, useState } from 'react';
import { simulate, singlePass, DEFAULTS } from './model/plant.js';
import { DWSIM_INPUT, DWSIM_PLANT as D, DWSIM_SWEEP } from './model/reference.js';
import { LineChart, Bars } from './charts.jsx';
import Flowsheet from './Flowsheet.jsx';

const TABS = [['inputs', 'Inputs'], ['overview', 'Overview'], ['simulation', 'Simulation'], ['streams', 'Streams & Energy'], ['reactor', 'Reactor'], ['economics', 'Sizing & Economics'], ['validation', 'Validation']];
const FIELDS = [
  ['Mission', [['targetKgDay', 'CH₄ target', 'kg/day', 10, 5000, 5, 'Plant size. Mission target is 625 kg/day.'], ['days', 'Mission duration', 'days', 30, 1000, 10, '480-day production window.'], ['uptime', 'Plant uptime', '%', 50, 100, 1, 'Running rate rises so the daily average still meets the target.']]],
  ['Reactor', [['T', 'Temperature', '°C', 200, 600, 5, 'Design window 300–400 °C.'], ['P', 'Pressure', 'bar', 1, 10, 0.5, 'Design point 5 bar. Sets the whole plant pressure.'], ['ratio', 'H₂:CO₂ at reactor inlet', 'mol/mol', 3.5, 4.5, 0.01, 'Tuned flowsheet runs at 3.99, close to the 4:1 design ratio.']]],
  ['Plant', [['eff', 'Electrolyser efficiency', '% HHV', 50, 80, 1, 'Team value not settled: 65% or 70%.'], ['purge', 'Purge', '% of recycle', 0.1, 20, 0.1, 'Vent that prevents build-up in the loop.'], ['h2Rec', 'H₂ recovery in separator', '%', 90, 100, 0.1, 'Assumed ideal split.'], ['co2Rec', 'CO₂ recovery in separator', '%', 90, 100, 0.01, 'Too low leaves CO₂ that would freeze in the product.'], ['compEff', 'Compressor efficiency', '% adiabatic', 40, 95, 1, 'Assumption.'], ['carnot', 'Refrigeration efficiency', '% of Carnot', 10, 60, 1, 'Assumption, used only for the estimated total.']]],
  ['Mars conditions', [['pMars', 'Atmospheric pressure', 'Pa', 400, 1000, 10, 'Typically about 600–700 Pa.'], ['tMars', 'CO₂ intake temperature', '°C', -100, 0, 5, 'Mean about −60 °C.']]],
  ['Economics', [['costKg', 'Transport cost to Mars', '$/kg', 100, 20000, 50, 'Project scenarios: 150–600, 700–1,700, 10,500–15,000.'], ['capex', 'Plant CapEx', '$B', 0.1, 5, 0.1, 'Project range $0.5–1.5B.'], ['opsPct', 'Operations per year', '% of CapEx', 0, 30, 1, 'About 10% of development cost.'], ['missions', 'Number of missions', '', 1, 10, 1, '2.2 years between missions.']]],
];
const ALL = FIELDS.flatMap(([, f]) => f);
const PRESETS = [['Design point', {}], ['Hot reactor: 550 °C', { T: 550 }], ['Low pressure: 1 bar', { P: 1 }], ['H₂-short feed: 3.6:1', { ratio: 3.6 }], ['Poor CO₂ removal: 95%', { co2Rec: 95 }], ['Small plant: 100 kg/day', { targetKgDay: 100, capex: 0.3 }]];
const fmt = (v, d = 1) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
const Tile = ({ v, l, c }) => <div className="card tile"><div className="v" style={c ? { color: c } : undefined}>{v}</div><div className="l">{l}</div></div>;
const LEVEL = { serious: '⛔ Serious', warning: '⚠ Warning', info: 'ℹ Note', good: '✓ Pass' };
const Msg = ({ level, children }) => <div className={`msg ${level}`}><b>{LEVEL[level]}</b><span>{children}</span></div>;

function Inputs({ draft, setDraft, applied, run }) {
  const errors = ALL.filter(([k, , , a, b]) => !(draft[k] >= a && draft[k] <= b)).map(([k]) => k);
  const dirty = ALL.some(([k]) => draft[k] !== applied[k]);
  const set = (k, v) => setDraft({ ...draft, [k]: v === '' ? NaN : Number(v) });
  return (<div className="stack">
    <div><h2>Enter input data</h2><p className="sub">Every field starts at your project's design values. Change anything, then run the simulation.</p></div>
    <div className="card row spread"><div className="row">{PRESETS.map(([n, o]) => <button key={n} className="btn" onClick={() => setDraft({ ...DEFAULTS, ...o })}>{n}</button>)}</div>
      <button className="btn primary" disabled={errors.length > 0} onClick={run}>{dirty ? 'Run simulation' : 'View results'}</button></div>
    {errors.length > 0 && <Msg level="serious">Fix {errors.length} out-of-range value{errors.length > 1 ? 's' : ''} before running.</Msg>}
    <div className="grid g2">{FIELDS.map(([g, fs]) => <div className="card" key={g}><h3>{g}</h3>{fs.map(([k, n, u, a, b, st, h]) => {
      const bad = errors.includes(k); const id = `f-${k}`; return (<div className="field" key={k}><label htmlFor={id}>{n}{u && <span style={{ fontWeight: 400, color: 'var(--ink2)' }}> ({u})</span>}</label>
        <input id={id} type="number" min={a} max={b} step={st} value={Number.isNaN(draft[k]) ? '' : draft[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={bad} />
        <input type="range" aria-label={n} min={a} max={b} step={st} value={Number.isNaN(draft[k]) ? a : draft[k]} onChange={(e) => set(k, e.target.value)} />
        <small className={bad ? 'err' : ''}>{bad ? `Must be between ${a} and ${b}.` : h}</small></div>);
    })}</div>)}</div>
  </div>);
}
function Overview({ r }) {
  const checks = [
    [r.missionCH4t >= 299.5, `Mission CH₄: ${fmt(r.missionCH4t)} t against the 300 t need`],
    [r.p.T >= 300 && r.p.T <= 400, `Reactor temperature ${r.p.T} °C against the 300–400 °C window`],
    [r.sp.S >= 99.8, `CH₄ selectivity ${fmt(r.sp.S, 2)}% (single pass) against 99.8%`],
    [r.co2Wt < 0.05, `CO₂ in product ${fmt(r.co2Wt, 3)} wt% against 0.05 wt% (limit is a design assumption)`],
    [r.o2ch4 >= 3.6, `O₂:CH₄ ${fmt(r.o2ch4, 2)} against the 3.6:1 engine need`],
    [r.payback <= 1.2, `Payback ${Number.isFinite(r.payback) ? fmt(r.payback, 2) + ' missions' : 'never'} against about one mission`],
  ];
  return (<div className="stack">
    <div><h2>Results overview</h2><p className="sub">{r.p.T} °C, {r.p.P} bar, H₂:CO₂ {r.p.ratio}:1, {r.p.eff}% electrolyser, {fmt(r.p.targetKgDay, 0)} kg CH₄/day target.</p></div>
    <div className="grid g4">
      <Tile v={`${fmt(r.ch4KgDay, 0)} kg/day`} l="CH₄ produced" c="var(--accent)" /><Tile v={`${fmt(r.X)}%`} l="CO₂ conversion per pass" /><Tile v={`${fmt(r.sp.S, 2)}%`} l="CH₄ selectivity, single pass" /><Tile v={`${fmt(r.elec.boundary, 0)} kW`} l="Electric load, without refrigeration" />
      <Tile v={fmt(r.yieldBoundary, 2)} l="kg CH₄/kW/day, without refrigeration" /><Tile v={`${fmt(r.missionCH4t)} t`} l={`CH₄ over ${r.p.days} days`} /><Tile v={`${fmt(r.missionLOXt, 0)} t`} l={`Liquid O₂ over ${r.p.days} days`} /><Tile v={`${fmt(r.purity, 2)} wt%`} l="Product CH₄ purity" />
    </div>
    {r.warnings.length > 0 && <div className="stack">{r.warnings.map((w) => <Msg key={w.text} level={w.level}>{w.text}</Msg>)}</div>}
    <div className="card"><h3>Design checks</h3><div className="stack" style={{ gap: 8 }}>{checks.map(([ok, t]) => <Msg key={t} level={ok ? 'good' : 'warning'}>{t}</Msg>)}</div></div>
    <p className="sub" style={{ margin: 0 }}>Checks compare against your project's targets. This is a simplified model, so read it with the Validation tab.</p>
  </div>);
}
const DETAILS = (r) => { const d = r.duties, e = r.elec; return {
  electrolyser: ['Electrolyser', 'Splits water into H₂ and O₂: 2 H₂O → 2 H₂ + O₂.', [['Water fed', `${fmt(r.byName['WATER-IN'].kgh)} kg/h`], ['H₂ made', `${fmt(r.byName.H2.kgh, 2)} kg/h`], ['Reaction enthalpy', `${fmt(d.qElec)} kW`], [`Electric input at ${r.p.eff}%`, `${fmt(e.electrolyser)} kW`]]],
  liquefier: ['O₂ precooler + liquefier', 'Cools O₂ from 80 °C to 25 °C, then to −170 °C.', [['O₂', `${fmt(r.o2Kgh)} kg/h`], ['Precooler', `${fmt(d.qO2Pre, 2)} kW`], ['Liquefier heat removed', `${fmt(d.qLox, 2)} kW`], ['Product state', r.byName['LOX-PRODUCT'].phase]]],
  compressor: ['CO₂ compressor train', 'Raises Mars CO₂ to plant pressure with intercooling to 25 °C.', r.stages.map((s) => [`Stage ${s.stage}: to ${s.pBar < 1 ? fmt(s.pBar, 3) : fmt(s.pBar, 2)} bar, ${fmt(s.ToutC, 0)} °C`, `${fmt(s.kW, 2)} kW`])],
  mixer: ['Feed mixer', 'Combines H₂, make-up CO₂ and recycle gas.', [['Mixed temperature', `${fmt(r.Tmix)} °C`], ['Total flow', `${fmt(r.byName.FEED.kgh)} kg/h`], ['H₂:CO₂', `${r.p.ratio}:1`]]],
  preheater: ['Preheater', 'Heats the feed to reactor temperature.', [['From', `${fmt(r.Tmix)} °C`], ['To', `${r.p.T} °C`], ['Duty', `${fmt(d.qPreheat)} kW`]]],
  reactor: ['Sabatier reactor', 'CO₂ + 4 H₂ → CH₄ + 2 H₂O, with reverse water-gas shift as the side reaction.', [['Conversion per pass', `${fmt(r.X, 2)}%`], ['Selectivity, single pass', `${fmt(r.sp.S, 2)}%`], ['Heat released', `${fmt(d.qRx)} kW`], ['Volume (actual / standard flow basis)', `${fmt(r.vActualL)} / ${fmt(r.vStdL)} L`]]],
  cooler: ['Cooler and water knock-out', 'Cools to 25 °C and condenses water for recycle.', [['Duty', `${fmt(d.qCool)} kW`], ['Water recovered', `${fmt(r.byName['WATER-RCY'].kgh)} kg/h`]]],
  separator: ['Gas separator (ideal)', 'Sends unreacted gas back to the reactor so CO₂ does not reach the cryo-cooler. Energy and hardware are not modelled.', [['H₂ recovery', `${r.p.h2Rec}%`], ['CO₂ recovery', `${r.p.co2Rec}%`], ['Lights flow', `${fmt(r.byName.LIGHTS.kgh, 2)} kg/h`]]],
  cryo: ['Cryo-cooler', 'Condenses methane at −170 °C.', [['Heat removed', `${fmt(d.qCryo, 2)} kW`], ['Product', `${fmt(r.byName['LCH4-PRODUCT'].kgh, 2)} kg/h`], ['CO₂ in product', `${fmt(r.co2Wt, 3)} wt%`]]],
  purge: ['Purge split', 'Vents a small share of recycle gas to stop build-up.', [['Purge', `${r.p.purge}%`], ['Vent flow', `${fmt(r.purgeKgH, 3)} kg/h`], ['Share of plant feed', `${fmt(r.purgePct, 3)}%`]]],
}; };
function Simulation({ r }) {
  const [sel, setSel] = useState('reactor'); const [day, setDay] = useState(0); const [play, setPlay] = useState(false); const [paused, setPaused] = useState(false);
  const days = r.p.days;
  useEffect(() => { setDay((d) => Math.min(d, days)); }, [days]);
  useEffect(() => { if (!play) return undefined; const t = setInterval(() => setDay((d) => { if (d >= days) { setPlay(false); return days; } return Math.min(days, d + Math.max(1, Math.round(days / 120))); }), 50); return () => clearInterval(t); }, [play, days]);
  const det = DETAILS(r)[sel]; const u = r.p.uptime / 100; const hrs = 24 * day * u;
  const need = 300; const ch4 = (r.ch4KgDay * day) / 1000;
  return (<div className="stack">
    <div><h2>Plant simulation</h2><p className="sub">Steady-state flows at your inputs. Select a unit to see its details.</p></div>
    <div className="card"><div className="row spread" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>Flowsheet</h3><button className="btn" onClick={() => setPaused(!paused)}>{paused ? 'Resume animation' : 'Pause animation'}</button></div>
      <Flowsheet r={r} sel={sel} onSel={setSel} paused={paused} /><div className="legend"><span><i style={{ background: 'var(--s4)' }} />CO₂</span><span><i style={{ background: 'var(--s1)' }} />H₂ / O₂</span><span><i style={{ background: 'var(--s3)' }} />Water</span><span><i style={{ background: 'var(--s2)' }} />Reacting gas</span></div></div>
    <div className="grid g2">
      <div className="card"><h3>{det[0]}</h3><p className="sub" style={{ marginBottom: 8 }}>{det[1]}</p><table><tbody>{det[2].map(([a, b]) => <tr key={a}><td className="wrap">{a}</td><td className="n">{b}</td></tr>)}</tbody></table></div>
      <div className="card"><div className="row spread"><h3 style={{ margin: 0 }}>Mission playback</h3><div className="row"><button className="btn primary" onClick={() => { if (day >= days) setDay(0); setPlay(!play); }}>{play ? 'Pause' : 'Play'}</button><button className="btn" onClick={() => { setPlay(false); setDay(0); }}>Reset</button></div></div>
        <div style={{ margin: '10px 0 4px', fontWeight: 600 }}>Day {day} of {days}</div><input aria-label="Mission day" type="range" min="0" max={days} value={day} onChange={(e) => { setPlay(false); setDay(Number(e.target.value)); }} style={{ width: '100%', accentColor: 'var(--accent)' }} />
        <div style={{ marginTop: 8 }}>CH₄: <b>{fmt(ch4)} t</b> of {need} t needed</div><div className="progress" role="progressbar" aria-valuenow={Math.min(100, Math.round((ch4 / need) * 100))} aria-valuemin="0" aria-valuemax="100"><div style={{ width: `${Math.min(100, (ch4 / need) * 100)}%` }} /></div>
        <table style={{ marginTop: 10 }}><tbody><tr><td>Liquid O₂ made</td><td className="n">{fmt((r.loxKgDay * day) / 1000)} t</td></tr><tr><td>CO₂ taken from atmosphere</td><td className="n">{fmt((r.co2KgH * hrs) / 1000)} t</td></tr><tr><td>Ice water used</td><td className="n">{fmt((r.waterKgH * hrs) / 1000)} t</td></tr><tr><td>Electric energy, without refrigeration</td><td className="n">{fmt((r.elec.boundary * hrs) / 1000, 0)} MWh</td></tr></tbody></table>
        <p className="sub" style={{ margin: '8px 0 0', fontSize: 13 }}>Assumes the steady rate holds throughout. Catalyst ageing, dust and start-up are not simulated.</p></div>
    </div>
  </div>);
}
function Streams({ r }) {
  const comps = ['CO2', 'H2', 'CH4', 'H2O', 'CO', 'O2']; const names = { CO2: 'CO₂', H2: 'H₂', CH4: 'CH₄', H2O: 'H₂O', CO: 'CO', O2: 'O₂' }; const d = r.duties; const e = r.elec;
  const nice = (v) => (v === 0 ? '–' : v < 0.01 ? '<0.01' : fmt(v, 2));
  return (<div className="stack">
    <div><h2>Streams & energy</h2><p className="sub">All values at your inputs. Mass in {fmt(r.massIn, 2)} kg/h, mass out {fmt(r.massOut, 2)} kg/h.</p></div>
    <div className="card"><h3>Stream table (kg/h)</h3><div className="tablewrap"><table><thead><tr><th>Stream</th><th className="n">T (°C)</th><th className="n">P (bar)</th><th>Phase</th><th className="n">Total</th>{comps.map((c) => <th className="n" key={c}>{names[c]}</th>)}</tr></thead>
      <tbody>{r.streams.map((s) => <tr key={s.name} className={/PRODUCT/.test(s.name) ? 'hi' : ''}><td>{s.name}</td><td className="n">{fmt(s.TC, 0)}</td><td className="n">{s.Pbar < 0.1 ? s.Pbar.toFixed(4) : fmt(s.Pbar, 2)}</td><td>{s.phase}</td><td className="n">{fmt(s.kgh, 2)}</td>{comps.map((c) => <td className="n" key={c}>{nice(s.comp[c])}</td>)}</tr>)}</tbody></table></div></div>
    <div className="grid g2">
      <div className="card"><h3>Electric load (kW)</h3><Bars rows={[[`Electrolyser (${r.p.eff}%)`, e.electrolyser], ['Preheater', e.preheat], ['CO₂ compressors', e.comp], ['Water heater', e.waterHeat], ['Refrigeration (estimate)', e.cold]]} />
        <table style={{ marginTop: 10 }}><tbody><tr><td>Without refrigeration</td><td className="n">{fmt(e.boundary)} kW, {fmt(r.yieldBoundary, 2)} kg/kW/day</td></tr><tr><td>With estimated refrigeration</td><td className="n">{fmt(e.totalEst)} kW, {fmt(r.yieldEst, 2)} kg/kW/day</td></tr><tr><td>Electrolyser share, without refrigeration</td><td className="n">{fmt(e.share)}%</td></tr></tbody></table>
        <p className="sub" style={{ margin: '8px 0 0', fontSize: 13 }}>Excludes separator energy, ice mining and CO₂ capture. No heat integration is assumed, though the reactor releases more heat than the heaters need.</p></div>
      <div className="card"><h3>Heat duties (kW)</h3><table><tbody>{[['Electrolyser reaction enthalpy', d.qElec], ['Water heater', d.qWaterHeat], ['Preheater', d.qPreheat], ['Sabatier heat released', d.qRx], ['Cooler + knock-out', d.qCool], ['Cryo-cooler heat removed', d.qCryo], ['O₂ precooler', d.qO2Pre], ['O₂ liquefier heat removed', d.qLox], ['Compressor shaft power', d.qComp], ['Intercoolers', d.qIC]].map(([a, b]) => <tr key={a}><td>{a}</td><td className="n">{fmt(b, 2)}</td></tr>)}</tbody></table></div>
    </div>
  </div>);
}
const range = (a, b, n) => Array.from({ length: n }, (_, i) => a + (i * (b - a)) / (n - 1));
function Reactor({ r }) {
  const { T, P, ratio } = r.p;
  const mk = (xs, fn) => { const pts = xs.map((x) => [x, fn(x)]); return [{ name: 'Selectivity (model)', color: 'var(--s3)', pts: pts.map(([x, v]) => [x, v.S]) }, { name: 'Conversion (model)', color: 'var(--s2)', pts: pts.map(([x, v]) => [x, v.X]) }]; };
  const tS = useMemo(() => mk(range(200, 600, 41), (x) => singlePass(x, P, ratio)), [P, ratio]);
  const pS = useMemo(() => mk(range(1, 10, 37), (x) => singlePass(T, x, ratio)), [T, ratio]);
  const rS = useMemo(() => mk(range(3.5, 4.5, 41), (x) => singlePass(T, P, x)), [T, P]);
  const dots = (pick) => { const pts = DWSIM_SWEEP.filter(pick); return pts.length ? [{ name: 'DWSIM conversion', dots: true, color: 'var(--s2)', pts: pts.map((a) => [pick.x(a), a[3]]) }, { name: 'DWSIM selectivity', dots: true, color: 'var(--s3)', pts: pts.map((a) => [pick.x(a), a[4]]) }] : []; };
  const pT = Object.assign((a) => a[1] === P && Math.abs(a[2] - ratio) <= 0.015, { x: (a) => a[0] }); const pP = Object.assign((a) => a[0] === T && Math.abs(a[2] - ratio) <= 0.015, { x: (a) => a[1] }); const pR = Object.assign((a) => a[0] === T && a[1] === P, { x: (a) => a[2] });
  return (<div className="stack">
    <div><h2>Reactor behaviour</h2><p className="sub">Single-pass equilibrium with a fresh H₂ and CO₂ feed. DWSIM dots appear when your other two inputs match a run we made (ratio within 0.015).</p></div>
    <div className="grid g4"><Tile v={`${fmt(r.sp.X, 2)}%`} l="Conversion, single pass, fresh feed" /><Tile v={`${fmt(r.sp.S, 2)}%`} l="Selectivity, single pass" /><Tile v={`${fmt(r.X, 2)}%`} l="Conversion per pass with recycle" /><Tile v={`${fmt(r.duties.qRx)} kW`} l="Heat released in the plant" /></div>
    <Msg level="info">This is thermodynamics only. Lower temperature and higher pressure always look better here because reaction rate, catalyst and compressor cost are not in these curves. These charts do not show an optimum.</Msg>
    <div className="grid g2w">
      <div className="card"><LineChart title={`Temperature sweep (${P} bar, ${ratio}:1)`} xLabel="Reactor temperature (°C)" xUnit=" °C" series={[...tS, ...dots(pT)]} marker={T} yMin={40} yMax={100} xTicks={[200,300,400,500,600]} /></div>
      <div className="card"><LineChart title={`Pressure sweep (${T} °C, ${ratio}:1)`} xLabel="Pressure (bar)" xUnit=" bar" series={[...pS, ...dots(pP)]} marker={P} yMin={40} yMax={100} xTicks={[1,2,3,4,5,6,7,8,9,10]} /></div>
      <div className="card"><LineChart title={`H₂:CO₂ sweep (${T} °C, ${P} bar)`} xLabel="H₂:CO₂ (mol/mol)" xUnit=":1" series={[...rS, ...dots(pR)]} marker={ratio} yMin={40} yMax={100} xTicks={[3.5,3.75,4,4.25,4.5]} /></div>
    </div>
  </div>);
}
function Economics({ r }) {
  const scen = [['Optimistic', 375], ['Realistic', 1200], ['Conservative', 12750]];
  const row = (cost, capex) => { const sav = (r.propellantT * 1000 * cost) / 1e9; const net = sav - capex * r.p.opsPct / 100 * 2.2; return { sav, pb: net > 0 ? capex / net : Infinity }; };
  const pb = (v) => (Number.isFinite(v) ? `${fmt(v, 2)} missions` : 'Never');
  const areas = Object.entries(r.areas);
  return (<div className="stack">
    <div><h2>Sizing & economics</h2><p className="sub">First-pass values. CapEx comes from your input and is not derived from the sizing.</p></div>
    <div className="grid g4"><Tile v={`$${fmt(r.savings, 2)}B`} l={`Savings per mission at $${fmt(r.p.costKg, 0)}/kg`} /><Tile v={`$${fmt(r.opsPerMission, 2)}B`} l="Operations per mission" /><Tile v={pb(r.payback)} l="Payback" c="var(--accent)" /><Tile v={`$${fmt(r.net, 2)}B`} l={`Net after ${r.p.missions} mission${r.p.missions > 1 ? 's' : ''}`} /></div>
    <div className="card"><h3>Payback by transport scenario ({fmt(r.propellantT, 0)} t propellant)</h3><div className="tablewrap"><table><thead><tr><th>Scenario</th><th className="n">Midpoint $/kg</th><th className="n">Savings</th><th className="n">CapEx $0.5B</th><th className="n">CapEx $1.0B</th><th className="n">CapEx $1.5B</th></tr></thead><tbody>{scen.map(([n, c]) => <tr key={n}><td>{n}</td><td className="n">{fmt(c, 0)}</td><td className="n">${fmt(row(c, 1).sav, 2)}B</td>{[0.5, 1, 1.5].map((k) => <td className="n" key={k}>{pb(row(c, k).pb)}</td>)}</tr>)}</tbody></table></div>
      <p className="sub" style={{ margin: '8px 0 0', fontSize: 13 }}>Payback = CapEx ÷ (savings − operations per mission). The project slides use the full cost range; these use midpoints. Propellant counted at the 3.5:1 engine ratio.</p></div>
    <div className="grid g2">
      <div className="card"><h3>Reactor volume at GHSV {fmt(r.p.ghsv, 0)} h⁻¹</h3><table><tbody><tr><td>Actual flow at reactor conditions</td><td className="n">{fmt(r.vActualL)} L</td></tr><tr><td>Standard-condition flow</td><td className="n">{fmt(r.vStdL)} L</td></tr></tbody></table><p className="sub" style={{ margin: '8px 0 0', fontSize: 13 }}>The answer depends on which basis the GHSV was quoted on. Confirm the basis before quoting one figure.</p></div>
      <div className="card"><h3>Heat-transfer area (m²)</h3><table><tbody>{areas.map(([n, v]) => <tr key={n}><td>{n}</td><td className="n">{fmt(v, 2)}</td></tr>)}</tbody></table><p className="sub" style={{ margin: '8px 0 0', fontSize: 13 }}>A = Q ÷ (U × LMTD) with default U = {r.p.U} W/m²K and LMTD = {r.p.lmtd} K for every unit: placeholders, not a thermal design.</p></div>
    </div>
  </div>);
}
function Validation() {
  const m = useMemo(() => simulate(DWSIM_INPUT), []); const q = m.duties;
  const rows = [['CO₂ make-up (kg/h)', m.co2KgH, D.co2KgH], ['Water make-up (kg/h)', m.waterKgH, D.waterKgH], ['Liquid O₂ (kg/h)', m.o2Kgh, D.o2Kgh], ['Conversion per pass (%)', m.X, D.X], ['Purge (kg/h)', m.purgeKgH, D.purgeKgH], ['Recycle gas (kg/h)', m.byName['RCY-GAS-IN'].kgh, D.recycleKgH], ['Electrolyser enthalpy (kW)', q.qElec, D.qElec], ['Preheater (kW)', q.qPreheat, D.qPreheat], ['Sabatier heat (kW)', q.qRx, D.qRx], ['Cooler + knock-out (kW)', q.qCool, D.qCool], ['Compressors (kW)', q.qComp, D.qComp]];
  const sw = DWSIM_SWEEP.map(([T, P, R, X, S]) => { const s = singlePass(T, P, R); return [Math.abs(s.X - X), Math.abs(s.S - S)]; });
  return (<div className="stack">
    <div><h2>Validation & limits</h2><p className="sub">How far to trust this site. It runs a simplified browser model, not DWSIM itself.</p></div>
    <div className="grid g2">
      <div className="card"><h3>Model vs solved DWSIM flowsheet (design point)</h3><div className="tablewrap"><table><thead><tr><th>Quantity</th><th className="n">This site</th><th className="n">DWSIM</th><th className="n">Difference</th></tr></thead><tbody>{rows.map(([n, a, b]) => <tr key={n}><td>{n}</td><td className="n">{fmt(a, 2)}</td><td className="n">{fmt(b, 2)}</td><td className="n">{fmt((Math.abs(a - b) / Math.abs(b)) * 100, 2)}%</td></tr>)}</tbody></table></div>
        <p className="sub" style={{ margin: '8px 0 0', fontSize: 13 }}>Water heater, cryo-cooler and O₂ liquefier are left out of this table because they are calibrated to DWSIM at this point, so matching proves nothing. Those per-kg values also do not change with pressure in this model.</p></div>
      <div className="stack">
        <div className="card"><h3>Reactor check against {DWSIM_SWEEP.length} DWSIM runs</h3><table><tbody><tr><td>Worst conversion difference</td><td className="n">{fmt(Math.max(...sw.map((a) => a[0])), 2)} points</td></tr><tr><td>Worst selectivity difference</td><td className="n">{fmt(Math.max(...sw.map((a) => a[1])), 2)} points</td></tr></tbody></table><p className="sub" style={{ margin: '8px 0 0', fontSize: 13 }}>Range: 200–600 °C, 1–10 bar, 3.5–4.5 H₂:CO₂. These are model-to-model checks, not measured data.</p></div>
        <div className="card"><h3>Not checked against DWSIM</h3><p className="sub" style={{ margin: 0 }}>The full plant was only solved in DWSIM at the design point. At other inputs, its plant-wide flows and duties are this model's predictions.</p></div>
      </div>
    </div>
    <div className="card"><h3>Simulated vs published data</h3><div className="tablewrap"><table><thead><tr><th>Metric</th><th>Our plant (design point)</th><th>Published</th><th>Reading</th></tr></thead><tbody>
      <tr><td>O₂ output</td><td>{fmt(m.o2Kgh, 0)} kg/h</td><td>MOXIE: 12 g/h on Mars</td><td className="wrap">About 4 orders of magnitude more needed; MOXIE is a different process (CO₂ electrolysis).</td></tr>
      <tr><td>O₂:CH₄ ratio</td><td>{fmt(m.o2ch4, 2)}:1</td><td>Raptor: about 3.6:1</td><td className="wrap">About 10% surplus O₂.</td></tr>
      <tr><td>Plant size</td><td>{fmt(((m.ch4Kgh + m.o2Kgh) * 8.76), 0)} t/yr CH₄ + O₂ at full uptime</td><td>NASA JSC 2024: 30 and 300 t/yr</td><td className="wrap">Ours is larger but excludes ice mining and CO₂ capture.</td></tr>
      <tr><td>Electrolyser share of power</td><td>{fmt(m.elec.share, 0)}%</td><td>NASA JSC 2024: 53–62%</td><td className="wrap">The gap comes mostly from what each study includes.</td></tr></tbody></table></div>
      <p className="sub" style={{ margin: '8px 0 0', fontSize: 13 }}>No measured Sabatier lab data is included yet, and no real plant of this kind exists. Nothing on this site is a measurement from one.</p></div>
    <div className="card"><h3>Main limits</h3><ul className="plain"><li>No reaction kinetics, so no catalyst sizing and no true optimum. 350 °C, 5 bar and 4:1 is a design point.</li><li>Pure CO₂ feed: N₂ and Ar build-up are not modelled.</li><li>Ideal gas separator with no energy or hardware counted. No solid CO₂ phase, no pressure drops.</li><li>Dissolved gases in recovered water are ignored, and all product CH₄ is taken as liquid with no vent flash.</li><li>Economics use midpoints and input CapEx. CapEx is not yet re-based on corrected sizing.</li></ul></div>
  </div>);
}
export default function App() {
  const init = () => { const h = window.location.hash.slice(1); return TABS.some(([k]) => k === h) ? h : 'inputs'; };
  const [tab, setTab] = useState(init); const [draft, setDraft] = useState(DEFAULTS); const [applied, setApplied] = useState(DEFAULTS);
  useEffect(() => { const f = () => setTab(init()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const go = (k) => { window.location.hash = k; setTab(k); window.scrollTo(0, 0); };
  const r = useMemo(() => simulate(applied), [applied]);
  const stale = ALL.some(([k]) => draft[k] !== applied[k]);
  return (<>
    <header><h1>Making Rocket Fuel on Mars</h1><p>Sabatier ISRU plant simulator · CHO301 Chemical Technology · Group 11</p></header>
    <nav role="tablist" aria-label="Sections">{TABS.map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)}>{n}</button>)}</nav>
    <main>
      {tab !== 'inputs' && tab !== 'validation' && stale && <div style={{ marginBottom: 14 }}><Msg level="info">You changed inputs that haven't been run yet, so these results use the previous values. <a href="#inputs">Go to Inputs</a></Msg></div>}
      {tab === 'inputs' && <Inputs draft={draft} setDraft={setDraft} applied={applied} run={() => { setApplied(draft); go('overview'); }} />}
      {tab === 'overview' && <Overview r={r} />}
      {tab === 'simulation' && <Simulation r={r} />}
      {tab === 'streams' && <Streams r={r} />}
      {tab === 'reactor' && <Reactor r={r} />}
      {tab === 'economics' && <Economics r={r} />}
      {tab === 'validation' && <Validation />}
      <footer>Simplified model checked against the team's DWSIM flowsheet. See Validation for limits.</footer>
    </main></>);
}
