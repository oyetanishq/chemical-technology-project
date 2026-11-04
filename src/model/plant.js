// Mars ISRU Sabatier plant: steady-state reduced-order model.
// Equilibrium is calculated from thermodynamic data; the plant balance is solved
// algebraically. Constants marked CAL are calibrated to the solved DWSIM flowsheet
// (flowsheet_v2) because they need phase behaviour this model does not calculate.
const R = 8.314462; // J/mol/K
export const MW = { CO2: 44.009, H2: 2.016, CH4: 16.043, H2O: 18.015, CO: 28.01, O2: 31.998 };
// Heat capacity Cp/R = A + B*T + C*T^2 + D/T^2 (Smith, Van Ness & Abbott, Appendix C)
const CP = {
  CH4: [1.702, 9.081e-3, -2.164e-6, 0],
  H2: [3.249, 0.422e-3, 0, 0.083e5],
  CO2: [5.457, 1.045e-3, 0, -1.157e5],
  CO: [3.376, 0.557e-3, 0, -0.031e5],
  H2O: [3.47, 1.45e-3, 0, 0.121e5],
  O2: [3.639, 0.506e-3, 0, -0.227e5],
};
// Standard formation properties at 298.15 K, ideal gas, J/mol
const HF = { CH4: -74520, H2: 0, CO2: -393509, CO: -110525, H2O: -241818 };
const GF = { CH4: -50460, H2: 0, CO2: -394359, CO: -137169, H2O: -228572 };
const T0 = 298.15;
const HV_WATER_25C = 43990; // J/mol
const P_SAT_WATER_25C = 3169; // Pa
const H_ELECTROLYSIS = 284800; // J/mol H2, CAL: DWSIM ELECTROLYSER at 80 C
const CP_WATER_EFF = 4.507; // kJ/kg/K, CAL: DWSIM W-HEAT, Peng-Robinson liquid
const Q_CRYO_PER_KG = 933; // kJ/kg, CAL: DWSIM CRYO-COOLER, 25 C to -170 C with condensation
const Q_LOX_PER_KG = 379.3; // kJ/kg, CAL: DWSIM O2-LIQUEFIER, 25 C to -170 C with condensation
export const COLD_T_K = 103.15;
export const P_MARS_DEFAULT_PA = 650;
const O2_PSAT_103K_BAR = 3.18; // Clausius-Clapeyron from the 90.19 K boiling point

const cpInt = (s, T1, T2) => { // integral of Cp dT, J/mol
  const [A, B, C, D] = CP[s];
  return R * (A * (T2 - T1) + (B / 2) * (T2 ** 2 - T1 ** 2) + (C / 3) * (T2 ** 3 - T1 ** 3) - D * (1 / T2 - 1 / T1));
};
const cpOverT = (s, T1, T2) => { // integral of Cp/T dT, J/mol/K
  const [A, B, C, D] = CP[s];
  return R * (A * Math.log(T2 / T1) + B * (T2 - T1) + (C / 2) * (T2 ** 2 - T1 ** 2) - (D / 2) * (1 / T2 ** 2 - 1 / T1 ** 2));
};
const cpAt = (s, T) => { const [A, B, C, D] = CP[s]; return R * (A + B * T + C * T ** 2 + D / T ** 2); };
const sumNu = (nu, f) => Object.entries(nu).reduce((a, [s, v]) => a + v * f(s), 0);
const dH = (nu, T) => sumNu(nu, (s) => HF[s] + cpInt(s, T0, T)); // J/mol extent
const lnK = (nu, T) => {
  const H298 = sumNu(nu, (s) => HF[s]); const G298 = sumNu(nu, (s) => GF[s]);
  const S298 = (H298 - G298) / T0;
  const G = dH(nu, T) - T * (S298 + sumNu(nu, (s) => cpOverT(s, T0, T)));
  return -G / (R * T);
};
const SABATIER = { CO2: -1, H2: -4, CH4: 1, H2O: 2 };
const RWGS = { CO2: -1, H2: -1, CO: 1, H2O: 1 };
const bisect = (f, a, b, n = 70) => {
  let fa = f(a);
  for (let i = 0; i < n; i++) {
    const m = (a + b) / 2; const fm = f(m);
    if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
  }
  return (a + b) / 2;
};

/** Ideal-gas equilibrium of Sabatier + reverse water-gas shift. feed in any mole basis. */
export function equilibrium(TK, Pbar, feed) {
  const f = { CO2: 0, H2: 0, CH4: 0, H2O: 0, CO: 0, ...feed };
  const K1 = lnK(SABATIER, TK); const K2 = lnK(RWGS, TK);
  const n = (x1, x2) => ({ CO2: f.CO2 - x1 - x2, H2: f.H2 - 4 * x1 - x2, CH4: f.CH4 + x1, H2O: f.H2O + 2 * x1 + x2, CO: f.CO + x2 });
  const E = 1e-12;
  const x2Of = (x1) => {
    const lo = -f.CO + E; const hi = Math.min(f.CO2 - x1, f.H2 - 4 * x1) - E;
    if (hi <= lo) return lo;
    const g = (x2) => { const m = n(x1, x2); return Math.log(Math.max(m.CO, E) * Math.max(m.H2O, E) / (Math.max(m.CO2, E) * Math.max(m.H2, E))) - K2; };
    return bisect(g, lo, hi);
  };
  const g1 = (x1) => {
    const m = n(x1, x2Of(x1));
    const N = m.CO2 + m.H2 + m.CH4 + m.H2O + m.CO;
    const y = (s) => Math.max(m[s], E) / N;
    return Math.log(y('CH4')) + 2 * Math.log(y('H2O')) - Math.log(y('CO2')) - 4 * Math.log(y('H2')) - 2 * Math.log(Pbar) - K1;
  };
  const x1 = bisect(g1, -f.CH4 + E, Math.min(f.CO2, f.H2 / 4) - E);
  const x2 = x2Of(x1);
  return { x1, x2, out: n(x1, x2) };
}

/** Single-pass reactor at a fresh H2:CO2 feed: conversion and selectivity in percent. */
export function singlePass(TC, Pbar, ratio) {
  const { x1, x2 } = equilibrium(TC + 273.15, Pbar, { CO2: 1, H2: ratio });
  return { X: (x1 + x2) * 100, S: (x1 / (x1 + x2)) * 100 };
}

export const DEFAULTS = {
  targetKgDay: 625, days: 480, uptime: 100, T: 350, P: 5, ratio: 3.99, eff: 65,
  h2Rec: 99, co2Rec: 99.95, purge: 2, compEff: 75, stages: 4, pMars: 650, tMars: -60,
  ghsv: 3600, U: 250, lmtd: 30, carnot: 30,
  capex: 1.0, opsPct: 10, costKg: 1200, missions: 1,
};

function compressor(nMolS, stages, pIn, pOut, TinK, eta) {
  const r = (pOut / pIn) ** (1 / stages); const out = [];
  let T1 = TinK;
  for (let i = 1; i <= stages; i++) {
    let T2 = T1 * r ** 0.25;
    for (let k = 0; k < 8; k++) { // isentropic outlet with T-dependent Cp
      const ds = (t) => cpOverT('CO2', T1, t) - R * Math.log(r);
      T2 = bisect(ds, T1, T1 * r ** 0.6, 40);
    }
    const w = cpInt('CO2', T1, T2) / (eta / 100);
    const Tout = bisect((t) => cpInt('CO2', T1, t) - w, T1, T1 + 2 * (T2 - T1) / (eta / 100), 40);
    const pStage = pIn * r ** i;
    const qIc = cpInt('CO2', 298.15, Tout);
    out.push({ stage: i, pBar: pStage / 1e5, ToutC: Tout - 273.15, kW: (nMolS * w) / 1000, icKW: (nMolS * Math.max(qIc, 0)) / 1000 });
    T1 = 298.15;
  }
  return out;
}

const comp = (o) => ({ CO2: 0, H2: 0, CH4: 0, H2O: 0, CO: 0, O2: 0, ...o });
const kgh = (n) => Object.fromEntries(Object.entries(comp(n)).map(([s, v]) => [s, v * MW[s]]));
const stream = (name, TC, Pbar, n, phase = 'Gas') => {
  const m = kgh(n); return { name, TC, Pbar, phase, kgh: Object.values(m).reduce((a, b) => a + b, 0), kmolh: Object.values(comp(n)).reduce((a, b) => a + b, 0), comp: m };
};

export function simulate(raw) {
  const p = { ...DEFAULTS, ...raw };
  const TK = p.T + 273.15; const Pbar = p.P;
  const uptime = p.uptime / 100;
  const targetKgh = p.targetKgDay / 24 / uptime; // running rate so the daily average meets the target
  const purge = p.purge / 100; const rH2 = p.h2Rec / 100; const rCO2 = p.co2Rec / 100; const rCO = 0.99; const rCH4 = 0.01;
  // Steady-state recycle per 1 kmol/h CO2 at the reactor inlet
  let m = 0; let w = 0; let co = 0; let eq; let lights; let wDry = 0;
  for (let i = 0; i < 5000; i++) {
    eq = equilibrium(TK, Pbar, { CO2: 1, H2: p.ratio, CH4: m, H2O: w, CO: co });
    const o = eq.out; const dry = o.CO2 + o.H2 + o.CH4 + o.CO;
    const yW = P_SAT_WATER_25C / (Pbar * 1e5);
    wDry = Math.min((yW / (1 - yW)) * dry, o.H2O);
    lights = { CO2: rCO2 * o.CO2, H2: rH2 * o.H2, CO: rCO * o.CO, CH4: rCH4 * o.CH4, H2O: wDry };
    const nm = (1 - purge) * lights.CH4; const nw = (1 - purge) * lights.H2O; const nc = (1 - purge) * lights.CO;
    if (Math.abs(nm - m) + Math.abs(nw - w) + Math.abs(nc - co) < 1e-12) { m = nm; w = nw; co = nc; break; }
    m = nm; w = nw; co = nc;
  }
  const productCH4perC = (1 - rCH4) * eq.out.CH4;
  const c = targetKgh / MW.CH4 / productCH4perC; // kmol/h CO2 at reactor inlet
  const sc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * c]));
  const inlet = sc({ CO2: 1, H2: p.ratio, CH4: m, H2O: w, CO: co });
  const out = sc(eq.out);
  const light = sc(lights);
  const rcy = sc(Object.fromEntries(Object.entries(lights).map(([k, v]) => [k, v * (1 - purge)])));
  const prg = sc(Object.fromEntries(Object.entries(lights).map(([k, v]) => [k, v * purge])));
  const product = { CO2: out.CO2 - light.CO2, H2: out.H2 - light.H2, CH4: out.CH4 - light.CH4, CO: out.CO - light.CO };
  const recoveredWater = out.H2O - light.H2O;
  const co2Makeup = inlet.CO2 - rcy.CO2;
  const h2Made = inlet.H2 - rcy.H2;
  const waterToElectrolyser = h2Made;
  const waterMakeup = waterToElectrolyser - recoveredWater;
  const o2Made = h2Made / 2;
  const dryGas = { CO2: out.CO2, H2: out.H2, CH4: out.CH4, CO: out.CO, H2O: light.H2O };
  // Mix temperature ahead of the preheater
  const hOf = (n, T) => Object.entries(n).reduce((a, [s, v]) => a + v * cpInt(s, T0, T), 0);
  const hMix = h2Made * cpInt('H2', T0, 353.15);
  const Tmix = bisect((t) => hOf(inlet, t) - hMix, 298.15, 500);
  const kW = (kmolh, Jmol) => (kmolh * Jmol) / 3600;
  // Duties, kW (molar in kmol/h, J/mol: 1 kmol/h * 1 J/mol = 1/3600 kW)
  const qElec = kW(h2Made, H_ELECTROLYSIS);
  const qWaterHeat = ((waterToElectrolyser * MW.H2O) * CP_WATER_EFF * 55) / 3600;
  const qPreheat = (hOf(inlet, TK) - hOf(inlet, Tmix)) / 3600;
  const qRx = (eq.x1 * c * dH(SABATIER, TK) + eq.x2 * c * dH(RWGS, TK)) / 3600;
  const qCool = (hOf(out, TK) - hOf(out, 298.15)) / 3600 + kW(recoveredWater, HV_WATER_25C);
  const rich = product.CO2 * MW.CO2 + product.H2 * MW.H2 + product.CH4 * MW.CH4 + product.CO * MW.CO;
  const qCryo = (rich * Q_CRYO_PER_KG) / 3600;
  const o2Kgh = o2Made * MW.O2;
  const qO2Pre = kW(o2Made, cpInt('O2', 298.15, 353.15));
  const qLox = (o2Kgh * Q_LOX_PER_KG) / 3600;
  const co2MolS = (co2Makeup * 1000) / 3600;
  const stages = compressor(co2MolS, p.stages, p.pMars, Pbar * 1e5, p.tMars + 273.15, p.compEff);
  const qComp = stages.reduce((a, s) => a + s.kW, 0);
  const qIC = stages.reduce((a, s) => a + s.icKW, 0);
  // Electric load on the same boundary as the deck, then an estimate with refrigeration
  const elecElectrolyser = qElec / (p.eff / 100);
  const elecBoundary = elecElectrolyser + qComp + qPreheat + qWaterHeat;
  const carnotCOP = (COLD_T_K / (298.15 - COLD_T_K)) * (p.carnot / 100);
  const elecCold = (qCryo + qLox) / carnotCOP;
  const elecTotalEst = elecBoundary + elecCold;
  // Streams
  const Tc = p.T;
  const streams = [
    stream('CO2-MARS', p.tMars, p.pMars / 1e5, { CO2: co2Makeup }),
    stream('CO2-IN', 25, Pbar, { CO2: co2Makeup }),
    stream('WATER-MAKEUP', 25, Pbar, { H2O: waterMakeup }, 'Liquid'),
    stream('WATER-RCY', 25, Pbar, { H2O: recoveredWater }, 'Liquid'),
    stream('WATER-IN', 80, Pbar, { H2O: waterToElectrolyser }, 'Liquid'),
    stream('H2', 80, Pbar, { H2: h2Made }),
    stream('O2-OUT', 80, Pbar, { O2: o2Made }),
    stream('RCY-GAS-IN', 25, Pbar, rcy),
    stream('FEED', Tmix - 273.15, Pbar, inlet),
    stream('REACTOR-IN', Tc, Pbar, inlet),
    stream('RX-OUT', Tc, Pbar, out),
    stream('DRY-GAS', 25, Pbar, dryGas),
    stream('LIGHTS', 25, Pbar, light),
    stream('PURGE-VENT', 25, Pbar, prg),
    stream('CH4-RICH', 25, Pbar, product),
    stream('LCH4-PRODUCT', -170, Pbar, product, 'Liquid'),
    stream('LOX-PRODUCT', -170, Pbar, { O2: o2Made }, Pbar >= O2_PSAT_103K_BAR ? 'Liquid' : 'Gas'),
  ];
  const byName = Object.fromEntries(streams.map((s) => [s.name, s]));
  const massIn = byName['CO2-MARS'].kgh + byName['WATER-MAKEUP'].kgh;
  const massOut = byName['LCH4-PRODUCT'].kgh + byName['LOX-PRODUCT'].kgh + byName['PURGE-VENT'].kgh;
  const ch4Kgh = product.CH4 * MW.CH4;
  const ch4KgDay = ch4Kgh * 24 * uptime; const loxKgDay = o2Kgh * 24 * uptime;
  const X = (1 - out.CO2 / inlet.CO2) * 100;
  const S = (eq.x1 / (eq.x1 + eq.x2)) * 100;
  const sp = singlePass(p.T, p.P, p.ratio);
  // Sizing
  const totalMolS = (Object.values(inlet).reduce((a, b) => a + b, 0) * 1000) / 3600;
  const vActualL = ((totalMolS * R * TK) / (Pbar * 1e5) / p.ghsv) * 3600 * 1000;
  const vStdL = ((totalMolS * R * 273.15) / 101325 / p.ghsv) * 3600 * 1000;
  const area = (q) => (Math.abs(q) * 1000) / (p.U * p.lmtd);
  // Economics
  const propellantT = (ch4KgDay * p.days * 4.5) / 1000; // used at the 3.5:1 engine ratio
  const savings = (propellantT * 1000 * p.costKg) / 1e9; // $B per mission
  const opsYr = (p.capex * p.opsPct) / 100; const opsPerMission = opsYr * 2.2;
  const netPerMission = savings - opsPerMission;
  const payback = netPerMission > 0 ? p.capex / netPerMission : Infinity;
  const net = p.missions * netPerMission - p.capex;
  // Warnings
  const warn = [];
  const add = (level, text) => warn.push({ level, text });
  if (p.T > 500) add('serious', `Above 500 °C: single-pass selectivity is down to ${sp.S.toFixed(1)}% as reverse water-gas shift takes over.`);
  else if (p.T > 400) add('warning', 'Above the 400 °C design window: conversion falls and CO starts to form.');
  if (p.T < 300) add('warning', 'Below 300 °C the reaction is limited by rate, which this equilibrium model does not calculate. Real conversion would be lower than shown.');
  if (p.ratio < 3.9) add('warning', `H₂-short feed (${p.ratio}:1): single-pass conversion drops to ${sp.X.toFixed(1)}% and the CO₂ recycle grows.`);
  if (p.ratio > 4.1) add('warning', `H₂-rich feed (${p.ratio}:1): more H₂ circulates and is lost through the purge.`);
  if (p.P < O2_PSAT_103K_BAR) add('serious', `At ${p.P} bar, O₂ does not liquefy at −170 °C (about ${O2_PSAT_103K_BAR} bar is needed). The liquefier needs a colder duty, which is not modelled.`);
  if (p.co2Rec < 99.9) add('serious', `CO₂ removal at ${p.co2Rec}% leaves ${((product.CO2 * MW.CO2) / rich * 100).toFixed(2)} wt% CO₂ in the product. It would freeze at −170 °C, and this model has no solid phase.`);
  if (p.purge < 0.5) add('warning', 'A very small purge makes the recycle loop very sensitive to any feed imbalance.');
  if (p.targetKgDay !== 625) add('info', 'Economics do not rescale the CapEx with plant size. Adjust CapEx yourself when changing the target.');
  return {
    p, X, S, sp, c, m, inlet, out, streams, byName, Tmix: Tmix - 273.15,
    ch4KgDay, loxKgDay, ch4Kgh, o2Kgh, co2Makeup, waterMakeup, h2Made, recoveredWater,
    co2KgH: co2Makeup * MW.CO2, waterKgH: waterMakeup * MW.H2O,
    purgeKgH: byName['PURGE-VENT'].kgh, purgePct: (byName['PURGE-VENT'].kgh / massIn) * 100,
    massIn, massOut, massErrPct: ((massOut - massIn) / massIn) * 100,
    o2ch4: o2Kgh / ch4Kgh, purity: (ch4Kgh / rich) * 100, co2Wt: ((product.CO2 * MW.CO2) / rich) * 100,
    missionCH4t: (ch4KgDay * p.days) / 1000, missionLOXt: (loxKgDay * p.days) / 1000,
    daysFor300t: 300000 / ch4KgDay,
    duties: { qElec, qWaterHeat, qPreheat, qRx, qCool, qCryo, qO2Pre, qLox, qComp, qIC }, stages,
    elec: { electrolyser: elecElectrolyser, comp: qComp, preheat: qPreheat, waterHeat: qWaterHeat, boundary: elecBoundary, cold: elecCold, totalEst: elecTotalEst, share: (elecElectrolyser / elecBoundary) * 100 },
    yieldBoundary: p.targetKgDay / elecBoundary, yieldEst: p.targetKgDay / elecTotalEst,
    vActualL, vStdL, rxArea: area(qRx), areas: { Preheater: area(qPreheat), 'Sabatier reactor': area(qRx), 'Water cooler': area(qCool), 'Cryo-cooler': area(qCryo), 'O₂ liquefier': area(qLox) },
    propellantT, savings, opsYr, opsPerMission, netPerMission, payback, net,
    warnings: warn,
  };
}
