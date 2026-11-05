import sys,os,time
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import dwhost; clr=dwhost.start()
for n in 'DWSIM.Interfaces DWSIM.FlowsheetBase DWSIM.Thermodynamics DWSIM.UnitOperations DWSIM.SharedClasses DWSIM.GlobalSettings System.Xml.Linq'.split(): clr.AddReference(n)
import System
from System.Xml.Linq import XDocument
def new():
    System.Reflection.Assembly.SetEntryAssembly(System.Reflection.Assembly.Load('DWSIM.UI.Desktop.Avalonia'))
    T=System.Reflection.Assembly.Load('DWSIM.UI.Desktop.Avalonia').GetType('DWSIM.UI.Desktop.Avalonia.AvaloniaFlowsheet')
    fs=System.Activator.CreateInstance(T); fs.SupressMessages=True
    fs.Initialize()
    if fs.AvailablePropertyPackages.Count==0: fs.AddPropPacks()
    return fs
def load(path):
    fs=new(); fs.LoadFromXML(XDocument.Load(path)); return fs
def O(fs,tag):
    o=fs.GetFlowsheetSimulationObject(tag)
    return o.__implementation__ if o is not None else None
def solve(fs):
    t=time.time(); e=fs.RequestCalculationAndWait(); return time.time()-t,[str(x) for x in e]
def stream(fs,tag):
    s=O(fs,tag); ph=s.Phases[0]; r={'T_C':s.GetTemperature()-273.15,'P_bar':s.GetPressure()/1e5,'kg_h':s.GetMassFlow()*3600,'comp':{}}
    for kv in ph.Compounds:
        m=(kv.Value.MassFlow or 0.0)*3600
        if m>1e-6: r['comp'][kv.Key]=round(m,5)
    return r
def Q(fs,tag): return O(fs,tag).EnergyFlow
def add_comp(fs,ms,name):
    from DWSIM.Thermodynamics.BaseClasses import Compound
    cp=fs.SelectedCompounds[name]
    for kv in ms.Phases:
        ph=kv.Value
        if not ph.Compounds.ContainsKey(name):
            c=Compound(name,""); c.ConstantProperties=cp; ph.Compounds.Add(name,c)
