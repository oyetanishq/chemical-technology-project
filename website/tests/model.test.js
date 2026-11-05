import test from 'node:test'; import assert from 'node:assert/strict';
import { simulate, singlePass } from '../src/model/plant.js';
import { DWSIM_INPUT, DWSIM_PLANT as D, DWSIM_SWEEP } from '../src/model/reference.js';
const pct = (a, b) => Math.abs(a - b) / Math.abs(b) * 100;
test('single-pass equilibrium matches the DWSIM sweep', () => {
  let wx = 0, ws = 0;
  for (const [T, P, R, X, S] of DWSIM_SWEEP) { const r = singlePass(T, P, R); const dx = Math.abs(r.X - X), ds = Math.abs(r.S - S); wx = Math.max(wx, dx); ws = Math.max(ws, ds); console.log(T, P, R, 'X', r.X.toFixed(2), X, 'S', r.S.toFixed(2), S); }
  console.log('worst X diff', wx.toFixed(2), 'worst S diff', ws.toFixed(2));
  assert.ok(wx < 1.5); assert.ok(ws < 2.5);
});
test('plant matches DWSIM at the design point', () => {
  const r = simulate(DWSIM_INPUT);
  const rows = [['CO2 makeup', r.co2KgH, D.co2KgH], ['Water makeup', r.waterKgH, D.waterKgH], ['O2', r.o2Kgh, D.o2Kgh], ['X', r.X, D.X], ['Purge', r.purgeKgH, D.purgeKgH], ['Recycle', r.byName['RCY-GAS-IN'].kgh, D.recycleKgH],
    ['qElec', r.duties.qElec, D.qElec], ['qWaterHeat', r.duties.qWaterHeat, D.qWaterHeat], ['qPreheat', r.duties.qPreheat, D.qPreheat], ['qRx', r.duties.qRx, D.qRx], ['qCool', r.duties.qCool, D.qCool], ['qCryo', r.duties.qCryo, D.qCryo], ['qO2Pre', r.duties.qO2Pre, D.qO2Pre], ['qLox', r.duties.qLox, D.qLox], ['qComp', r.duties.qComp, D.qComp]];
  for (const [n, a, b] of rows) console.log(n.padEnd(12), a.toFixed(3).padStart(10), String(b).padStart(10), pct(a, b).toFixed(2) + '%');
  console.log('stages', r.stages.map((s) => s.kW.toFixed(2)), 'mass err %', r.massErrPct, 'O2:CH4', r.o2ch4, 'purity', r.purity, 'co2wt', r.co2Wt);
  console.log('elec', r.elec, 'yield', r.yieldBoundary, 'Tmix', r.Tmix, 'Vact', r.vActualL, 'Vstd', r.vStdL, 'area', r.rxArea, 'payback', r.payback, 'sav', r.savings);
  for (const [n, a, b] of rows) if (n !== 'Purge' && n !== 'Recycle') assert.ok(pct(a, b) < 5, n + ' off by ' + pct(a, b));
  assert.ok(Math.abs(r.massErrPct) < 1e-6);
});

test('extreme inputs stay physical', () => {
  let n = 0;
  for (const T of [200, 300, 350, 500, 600]) for (const P of [1, 5, 10]) for (const ratio of [3.5, 4, 4.5]) for (const purge of [0.1, 2, 20]) for (const co2Rec of [90, 99.95]) for (const h2Rec of [90, 99]) for (const uptime of [50, 100]) {
    const r = simulate({ T, P, ratio, purge, co2Rec, h2Rec, uptime }); n++;
    const label = JSON.stringify({ T, P, ratio, purge, co2Rec, h2Rec, uptime });
    for (const v of [r.X, r.co2KgH, r.waterKgH, r.o2Kgh, r.elec.boundary, r.duties.qRx, r.duties.qPreheat, r.purity]) assert.ok(Number.isFinite(v), label);
    assert.ok(r.co2KgH > 0, 'co2 ' + label); assert.ok(r.waterKgH > 0, 'water ' + label + ' ' + r.waterKgH); assert.ok(r.duties.qRx < 0, 'qRx ' + label);
    assert.ok(Math.abs(r.massErrPct) < 1e-3, 'mass ' + label + ' ' + r.massErrPct);
    assert.ok(Math.abs(r.ch4KgDay - 625) < 0.01, 'target ' + label);
  }
  console.log('extreme cases', n);
});
test('scales linearly with plant size', () => { const a = simulate({ targetKgDay: 625 }), b = simulate({ targetKgDay: 1250 }); assert.ok(Math.abs(b.co2KgH / a.co2KgH - 2) < 1e-9); assert.ok(Math.abs(b.duties.qRx / a.duties.qRx - 2) < 1e-9); });
test('stage count does not break compression', () => { const r = simulate({ pMars: 600, tMars: -100, compEff: 40 }); assert.ok(r.stages.every((s) => Number.isFinite(s.kW) && s.kW > 0)); });
