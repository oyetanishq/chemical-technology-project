"""Reloads the saved v2 file, re-solves it, checks balances, writes the TS-2 CSVs."""
import dw,os,csv
OUT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AT={'Water':(0,2,1),'Hydrogen':(0,2,0),'Oxygen':(0,0,2),'Carbon dioxide':(1,0,2),'Methane':(1,4,0),'Carbon monoxide':(1,0,1)}
MW={'Water':18.015,'Hydrogen':2.016,'Carbon dioxide':44.01}
fs=dw.load(OUT+'/simulation_v2.xml'); print('reloaded objects',fs.SimulationObjects.Count)
def mol(t): return {kv.Key:(kv.Value.MolarFlow or 0.0) for kv in dw.O(fs,t).Phases[0].Compounds}
def report(lbl):
    ins=['CO2-MARS','WATER-MAKEUP'];outs=['LOX-PRODUCT','LCH4-PRODUCT','H2-VENT','PURGE-VENT']
    tot=lambda L:[sum(sum(v*AT[k][i] for k,v in mol(t).items()) for t in L) for i in range(3)]
    I,U=tot(ins),tot(outs); mi=sum(dw.O(fs,t).GetMassFlow() for t in ins); mo=sum(dw.O(fs,t).GetMassFlow() for t in outs)
    r=dw.stream(fs,'REACTOR-IN')['comp'];x=dw.stream(fs,'RX-OUT')['comp']
    print(lbl,'C/H/O out/in',[round(a/b,6) for a,b in zip(U,I)],'mass',round(mo/mi,6),'H2:CO2',round((r['Hydrogen']/MW['Hydrogen'])/(r['Carbon dioxide']/MW['Carbon dioxide']),4),'X',round(1-x['Carbon dioxide']/r['Carbon dioxide'],4),flush=True)
report('as-saved ')
t,e=dw.solve(fs); print('re-solve',round(t),'s errors',e,'conv',[dw.O(fs,z).Converged for z in('RCY-GAS','RCY-W')],flush=True); report('re-solved')
comps=['Water','Hydrogen','Oxygen','Carbon dioxide','Methane','Carbon monoxide']; rows=[]
for so in fs.SimulationObjects.Values:
    o=so.__implementation__
    if type(o).__name__!='MaterialStream': continue
    tag=o.GraphicObject.Tag; s=dw.stream(fs,tag)
    row={'stream':tag,'T_C':round(s['T_C'],2),'P_bar':round(s['P_bar'],4),'mass_kg_h':round(s['kg_h'],4),'molar_kmol_h':round(o.GetMolarFlow()*3.6,5),'vapor_mole_frac':round(o.Phases[2].Properties.molarfraction or 0.0,4)}
    for c in comps: row[c+'_kg_h']=round((o.Phases[0].Compounds[c].MassFlow or 0)*3600,5)
    rows.append(row)
rows.sort(key=lambda r:r['stream'])
with open(OUT+'/ts2_streams_v2.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
duty=[('E-ELEC','ELECTROLYSER','reaction enthalpy at 100% efficiency, not electric input'),('E-W-HEAT','W-HEAT','heats water to 80 C'),('E-PREHEAT','PREHEAT','feed to 350 C'),('E-SABATIER','SABATIER','negative = heat removed'),('E-COOL-01','COOLER-01','to 25 C for water knock-out'),('E-SEP','GAS-SEP','solver balance term, NOT separation power'),('E-CRYO','CRYO-COOLER','heat removed, not electric input'),('E-O2-PRE','O2-PRECOOL','80 to 25 C'),('E-O2-LIQ','O2-LIQUEFIER','heat removed to -170 C, not electric input')]
for i in range(1,5): duty+=[(f'E-C-{i}',f'C-{i}','compressor shaft power, 75% adiabatic'),(f'E-IC-{i}',f'IC-{i}','intercooler heat removed')]
with open(OUT+'/ts2_duties_v2.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['energy_stream','unit','kW','meaning'])
    for a,b,c in duty: w.writerow([a,b,round(dw.Q(fs,a),3),c])
for a,_,_ in duty: print(a,round(dw.Q(fs,a),3))
print('compressor shaft total',round(sum(dw.Q(fs,f'E-C-{i}') for i in range(1,5)),3))
for t in 'CO2-MARS CO2-IN WATER-MAKEUP WATER-RCY RCY-GAS-IN PURGE-VENT H2-VENT LCH4-PRODUCT LOX-PRODUCT'.split(): print(t,dw.stream(fs,t),'vf',round(dw.O(fs,t).Phases[2].Properties.molarfraction or 0.0,3))
print('CHECKDONE',flush=True)
