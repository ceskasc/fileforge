# Read tensors only; never execute arbitrary PyTorch pickle globals.
import zipfile,pickle,io,collections,array,hashlib,json,sys,math

# Run only on the pinned, published model checkpoint; no torch or network access.
if len(sys.argv)!=4:raise ValueError('Expected checkpoint, destination prefix and SHA-256')
from pathlib import Path
checkpoint=Path(sys.argv[1]);destination=Path(sys.argv[2]);destination.parent.mkdir(parents=True,exist_ok=True)
if hashlib.sha256(checkpoint.read_bytes()).hexdigest()!=sys.argv[3]:raise ValueError('Restoration checkpoint SHA-256 mismatch')
class TensorReader(pickle.Unpickler):
 def find_class(self,module,name):
  if (module,name)==('collections','OrderedDict'):return collections.OrderedDict
  if (module,name)==('torch._utils','_rebuild_tensor_v2'):return lambda storage,offset,size,stride,*args:{'storage':storage,'offset':offset,'size':size,'stride':stride}
  if (module,name)==('torch','FloatStorage'):return 'float32'
  raise ValueError('Unsupported pickle global '+module+'.'+name)
 def persistent_load(self,tag):return tag
z=zipfile.ZipFile(checkpoint);pkl=next(n for n in z.namelist() if n.endswith('/data.pkl'));prefix=pkl[:-8]
state=TensorReader(io.BytesIO(z.read(pkl))).load()['params'];out=bytearray();specs=[]
expected=[]
for i in range(34):
 expected.extend(['body.'+str(i*2)+'.weight','body.'+str(i*2)+'.bias'])
 if i<33:expected.append('body.'+str(i*2+1)+'.weight')
if list(state)!=expected:raise ValueError('Unexpected SRVGG parameter layout')
for name,info in state.items():
 tag,kind,key,device,count=info['storage'];assert tag=='storage' and kind=='float32'
 a=array.array('f',z.read(prefix+'data/'+key));
 if sys.byteorder!='little':a.byteswap()
 shape=info['size'];assert len(a)==count==math.prod(shape) and info['offset']==0
 stride=1
 for size,actual in zip(reversed(shape),reversed(info['stride'])):assert actual==stride;stride*=size
 if len(shape)==4:
  oc,ic,kh,kw=shape;last=name=='body.66.weight';converted=array.array('f')
  for y in range(kh):
   for x in range(kw):
    for c in range(ic):
     for o in range(oc):
      old=(o%3)*16+o//3 if last else o
      converted.append(a[((old*ic+c)*kh+y)*kw+x])
  a=converted;shape=[kh,kw,ic,oc]
 elif name=='body.66.bias':a=array.array('f',(a[(o%3)*16+o//3] for o in range(len(a))))
 elif len(shape)==1 and name.endswith('.weight'):shape=[1,1,shape[0]]
 if sys.byteorder!='little':a.byteswap()
 out.extend(a.tobytes());specs.append({'name':name,'shape':shape,'dtype':'float32'})
destination.with_suffix('.bin').write_bytes(out);destination.with_suffix('.json').write_text(json.dumps(specs))
print('exported',len(specs),len(out))
