"""Host the CoreCLR shipped in DWSIM.app inside CPython 3.12 using DWSIM's Python.Runtime.dll."""
import ctypes,glob,os,sysconfig
APP='/Applications/DWSIM.app/Contents/MacOS'
def start():
    clr=ctypes.CDLL(os.path.join(APP,'libcoreclr.dylib'),mode=ctypes.RTLD_GLOBAL)
    tpa=':'.join(sorted(glob.glob(APP+'/*.dll')))
    props={'TRUSTED_PLATFORM_ASSEMBLIES':tpa,'NATIVE_DLL_SEARCH_DIRECTORIES':APP+':','APP_PATHS':APP,'APP_CONTEXT_BASE_DIRECTORY':APP+'/','System.Runtime.Serialization.EnableUnsafeBinaryFormatterSerialization':'false'}
    n=len(props);K=(ctypes.c_char_p*n)(*[k.encode() for k in props]);V=(ctypes.c_char_p*n)(*[v.encode() for v in props.values()])
    h=ctypes.c_void_p();d=ctypes.c_uint()
    rc=clr.coreclr_initialize((APP+'/DWSIM.UI.Desktop.Avalonia').encode(),b'dwsim',n,K,V,ctypes.byref(h),ctypes.byref(d))
    if rc: raise SystemExit('coreclr_initialize rc=%x'%(rc&0xffffffff))
    f=ctypes.c_void_p()
    rc=clr.coreclr_create_delegate(h,d,b'Python.Runtime',b'Python.Runtime.Loader',b'Initialize',ctypes.byref(f))
    if rc: raise SystemExit('create_delegate rc=%x'%(rc&0xffffffff))
    fn=ctypes.CFUNCTYPE(ctypes.c_int,ctypes.c_char_p,ctypes.c_int)(f.value)
    lib=os.path.join(sysconfig.get_config_var('LIBDIR'),sysconfig.get_config_var('LDLIBRARY')).encode()
    if not os.path.exists(lib): lib=(sysconfig.get_config_var('PYTHONFRAMEWORKPREFIX')+'/'+sysconfig.get_config_var('INSTSONAME')).encode()
    rc=fn(lib,len(lib))
    if rc: raise SystemExit('pythonnet init rc=%d'%rc)
    import clr as c
    return c
