"""Builds Mars ISRU flowsheet v2 (TS-2, with the TS-1 Gibbs reactor) from ../../simulation.xml. Never modifies the input."""
import dw,sys,json,csv,os,zipfile,shutil
from DWSIM.Interfaces.Enums.GraphicObjects import ObjectType as OT
from DWSIM.UnitOperations.UnitOperations.Auxiliary import ComponentSeparationSpec as CSS
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(HERE); SRC=os.path.join(os.path.dirname(OUT),'simulation.xml')
CO2_KGH=71.524; H2O_KGH=58.675; P_MARS=650.0; T_MARS=213.15; ETA=75.0; NST=4; PURGE=0.02
fs=dw.load(SRC); fs.AddCompound('Carbon monoxide')
for so in fs.SimulationObjects.Values:
    o=so.__implementation__
    if type(o).__name__=='MaterialStream': dw.add_comp(fs,o,'Carbon monoxide')
go=lambda t: dw.O(fs,t).GraphicObject
def add(ty,x,y,tag):
    o=fs.AddObject(ty,int(x),int(y),tag).__implementation__
    if type(o).__name__=='MaterialStream': dw.add_comp(fs,o,'Carbon monoxide')
    return o
def C(a,b,pa=0,pb=0): fs.ConnectObjects(go(a),go(b),pa,pb)
def move(t,dx=0):
    g=go(t); g.X=g.X+dx
def setcomp(ms,c):
    for kv in ms.Phases[0].Compounds: kv.Value.MoleFraction=1.0 if kv.Key==c else 0.0
# TS-1 Gibbs reactor replaces the typed 95% conversion
fs.DeleteObject('SABATIER',False)
g=add(OT.RCT_Gibbs,870,150,'SABATIER')
C('REACTOR-IN','SABATIER'); C('SABATIER','RX-OUT',0,0); C('SABATIER','RX-LIQ',1,0); C('E-SABATIER','SABATIER',0,1)
g.ReactorOperationMode=type(g.ReactorOperationMode).Isothermic
g.ComponentIDs.Clear()
for c in ['Water','Hydrogen','Carbon dioxide','Methane','Carbon monoxide']: g.ComponentIDs.Add(c)
g.CreateElementMatrix()
n=75.2/44.01/3.6
g.InitialEstimates.Clear()
for v in [2*.95*n,4*.05*n,.05*n,.95*n,1e-4*n]: g.InitialEstimates.Add(v)
sp=dw.O(fs,'H2-O2-SPLIT'); tmpl=sp.ComponentSepSpecs['Methane']
def spec(sep,c,val):
    s=CSS(); s.ComponentID=c; s.SepSpec=tmpl.SepSpec; s.SpecUnit='%'; s.SpecValue=val
    if sep.ComponentSepSpecs.ContainsKey(c): sep.ComponentSepSpecs[c]=s
    else: sep.ComponentSepSpecs.Add(c,s)
spec(sp,'Carbon monoxide',0.0)
for t in 'CRYO-COOLER E-CRYO CRYO-OUT CH4-STORAGE H2-VENT LCH4-PRODUCT'.split(): move(t,220)
# Gas separation + H2/CO2 recycle with purge
fs.DisconnectObjects(go('DRY-GAS'),go('CRYO-COOLER'))
dx=go('DRY-GAS').X; dy=go('DRY-GAS').Y
sep=add(OT.ComponentSeparator,dx+90,dy,'GAS-SEP')
add(OT.MaterialStream,dx+180,dy+10,'CH4-RICH'); add(OT.MaterialStream,dx+180,dy+130,'LIGHTS'); add(OT.EnergyStream,dx+90,dy+90,'E-SEP')
C('DRY-GAS','GAS-SEP'); C('GAS-SEP','LIGHTS',0,0); C('GAS-SEP','CH4-RICH',1,0); C('GAS-SEP','E-SEP',0,0); C('CH4-RICH','CRYO-COOLER',0,0)
sep.SpecifiedStreamIndex=0
for c,v in [('Hydrogen',99.0),('Carbon dioxide',99.95),('Carbon monoxide',99.0),('Water',100.0),('Methane',1.0),('Oxygen',100.0)]: spec(sep,c,v)
pu=add(OT.Splitter,dx+90,dy+230,'PURGE-SPLIT')
add(OT.MaterialStream,dx+200,dy+290,'PURGE-VENT'); add(OT.MaterialStream,dx-60,dy+240,'RCY-GAS-OUT')
C('LIGHTS','PURGE-SPLIT'); C('PURGE-SPLIT','RCY-GAS-OUT',0,0); C('PURGE-SPLIT','PURGE-VENT',1,0)
pu.Ratios[0]=1-PURGE; pu.Ratios[1]=PURGE; pu.Ratios[2]=0.0
add(OT.OT_Recycle,dx-180,dy+240,'RCY-GAS'); add(OT.MaterialStream,dx-320,dy+240,'RCY-GAS-IN')
C('RCY-GAS-OUT','RCY-GAS'); C('RCY-GAS','RCY-GAS-IN',0,0)
fs.ConnectObjects(go('RCY-GAS-IN'),go('MIX-01'),0,2)
# Water recycle + make-up
x0=go('WATER-IN').X; y0=go('WATER-IN').Y
wm=add(OT.Mixer,x0-150,y0,'MIX-W'); wh=add(OT.Heater,x0-70,y0,'W-HEAT')
add(OT.MaterialStream,x0-110,y0,'W-MIXED'); add(OT.EnergyStream,x0-70,y0+70,'E-W-HEAT')
mk=add(OT.MaterialStream,x0-260,y0-40,'WATER-MAKEUP'); add(OT.MaterialStream,x0-260,y0+140,'WATER-RCY')
C('WATER-MAKEUP','MIX-W',0,0); fs.ConnectObjects(go('WATER-RCY'),go('MIX-W'),0,1); C('MIX-W','W-MIXED',0,0); C('W-MIXED','W-HEAT',0,0); C('E-W-HEAT','W-HEAT',0,1); C('W-HEAT','WATER-IN',0,0)
wh.CalcMode=type(wh.CalcMode).OutletTemperature; wh.OutletTemperature=353.15; wh.DeltaP=0.0
wm.PressureCalculation=dw.O(fs,'MIX-01').PressureCalculation
mk.SetTemperature(298.15); mk.SetPressure(5e5); mk.SetMassFlow(H2O_KGH/3600); setcomp(mk,'Water')
add(OT.OT_Recycle,x0-260,y0+230,'RCY-W')
C('WATER-RECOVERED','RCY-W'); C('RCY-W','WATER-RCY',0,0)
# O2 precooler + liquefier
ox=go('O2-OUT').X; oy=go('O2-OUT').Y
pre=add(OT.Cooler,ox+90,oy,'O2-PRECOOL'); add(OT.MaterialStream,ox+180,oy,'O2-WARM'); add(OT.EnergyStream,ox+90,oy-60,'E-O2-PRE')
liq=add(OT.Cooler,ox+270,oy,'O2-LIQUEFIER'); add(OT.MaterialStream,ox+360,oy,'LOX-PRODUCT'); add(OT.EnergyStream,ox+270,oy-60,'E-O2-LIQ')
C('O2-OUT','O2-PRECOOL',0,0); C('O2-PRECOOL','O2-WARM',0,0); C('O2-PRECOOL','E-O2-PRE',0,0); C('O2-WARM','O2-LIQUEFIER',0,0); C('O2-LIQUEFIER','LOX-PRODUCT',0,0); C('O2-LIQUEFIER','E-O2-LIQ',0,0)
for u,t in ((pre,298.15),(liq,103.15)):
    u.CalcMode=type(u.CalcMode).OutletTemperature; u.OutletTemperature=t; u.DeltaP=0.0
# CO2 compressor train
cx=go('CO2-IN').X; cy=go('CO2-IN').Y
xs=lambda i: cx-760+i*125
ys=cy+160
m=add(OT.MaterialStream,xs(0)-90,ys,'CO2-MARS')
m.SetTemperature(T_MARS); m.SetPressure(P_MARS); m.SetMassFlow(CO2_KGH/3600); setcomp(m,'Carbon dioxide')
rs=(5e5/P_MARS)**(1/NST); P=P_MARS; prev='CO2-MARS'
for s in range(1,NST+1):
    P*=rs
    k=add(OT.Compressor,xs(2*s-2),ys,f'C-{s}'); add(OT.EnergyStream,xs(2*s-2),ys+70,f'E-C-{s}')
    k.CalcMode=type(k.CalcMode).OutletPressure; k.POut=P; k.AdiabaticEfficiency=ETA
    add(OT.MaterialStream,xs(2*s-2)+60,ys,f'S-C{s}')
    C(prev,f'C-{s}',0,0); C(f'E-C-{s}',f'C-{s}',0,1); C(f'C-{s}',f'S-C{s}',0,0)
    ic=add(OT.Cooler,xs(2*s-1),ys,f'IC-{s}'); add(OT.EnergyStream,xs(2*s-1),ys+70,f'E-IC-{s}')
    ic.CalcMode=type(ic.CalcMode).OutletTemperature; ic.OutletTemperature=298.15; ic.DeltaP=0.0
    C(f'S-C{s}',f'IC-{s}',0,0); C(f'IC-{s}',f'E-IC-{s}',0,0)
    if s<NST:
        add(OT.MaterialStream,xs(2*s-1)+60,ys,f'S-IC{s}'); C(f'IC-{s}',f'S-IC{s}',0,0); prev=f'S-IC{s}'
    else:
        C(f'IC-{s}','CO2-IN',0,0)
# Seed recycle tears from the hand mass balance
MW={'Water':18.015,'Hydrogen':2.016,'Oxygen':31.998,'Carbon dioxide':44.01,'Methane':16.043,'Carbon monoxide':28.01}
def seed(t,kmolh):
    ms=dw.O(fs,t); tot=sum(kmolh.values())
    ms.SetTemperature(298.15); ms.SetPressure(5e5); ms.SetMassFlow(sum(MW[k]*v for k,v in kmolh.items())/3600)
    for kv in ms.Phases[0].Compounds: kv.Value.MoleFraction=kmolh.get(kv.Key,0.0)/tot
seed('RCY-GAS-IN',{'Carbon dioxide':.0837,'Hydrogen':.3316,'Methane':.0159,'Water':.011}); seed('WATER-RCY',{'Water':3.236})
for t,tol in (('RCY-GAS',1e-6),('RCY-W',1e-6)):
    r=dw.O(fs,t); r.ConvergenceParameters.Temperatura=0.01; r.ConvergenceParameters.Pressao=1.0; r.ConvergenceParameters.VazaoMassica=tol; r.MaximumIterations=500
t,e=dw.solve(fs); print('loose solve',round(t),e,flush=True); assert not e
for x in ('RCY-GAS','RCY-W'): dw.O(fs,x).ConvergenceParameters.VazaoMassica=1e-8
t,e=dw.solve(fs); print('tight solve',round(t),e,flush=True); assert not e
assert all(dw.O(fs,x).Converged for x in ('RCY-GAS','RCY-W'))
# Layout: bring everything on canvas (no effect on results)
gs=[so.GraphicObject for so in fs.SimulationObjects.Values]
mx=min(a.X for a in gs); my=min(a.Y for a in gs)
for a in gs: a.X=a.X-mx+60; a.Y=a.Y-my+60
sf=fs.GetSurface(); sf=getattr(sf,'__implementation__',sf); sf.ZoomAll(1600,800)
fs.SaveToXML().Save(OUT+'/simulation_v2.xml')
with zipfile.ZipFile(OUT+'/Mars_ISRU_flowsheet_v2.dwxmz','w',zipfile.ZIP_DEFLATED) as z: z.write(OUT+'/simulation_v2.xml','simulation.xml')
fs.SavePFDScreenshotToPNG(OUT+'/flowsheet_v2.png')
print('saved',flush=True)
