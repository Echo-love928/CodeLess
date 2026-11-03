"""D28-A read-only original-evidence verifier. No models, HTTP, Docker or deployment writes.
Use the fixed original private intake layout documented in D28-B-FINAL-REVIEW.md.
Only derived audit outputs are written; raw originals are not modified.
"""
import argparse,os
from pathlib import Path,PurePosixPath
import json,tarfile,hashlib
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',required=True);args=parser.parse_args();r=Path(args.root).resolve();assert r.is_relative_to(Path(__file__).resolve().parents[3]/'tests/release/api/.private'),'Use a Git-ignored private intake root';d=json.loads((r/'closeout/final-acceptance.json').read_bytes());receipt=json.loads((r/'closeout/receipt.json').read_bytes());assert hashlib.sha256((r/'closeout/final-acceptance.json').read_bytes()).hexdigest()==receipt['reportSha256'];assert hashlib.sha256((r/'closeout/raw-private.tar').read_bytes()).hexdigest()==receipt['rawPrivateSha256']
assert hashlib.sha256((r/'closeout/raw-private.tar').read_bytes()).hexdigest()=='9dc7d8a2a9014085412b1b54c7e03af4e244718f65e929d5ec1656fd36bf7b23'
assert hashlib.sha256((r/'retest/evidence.tar').read_bytes()).hexdigest()=='723dd92462fe1115fb6125d59e31b73883220a366faf9f4461d65ca5e63b30c3'
idx={}
for label,a in [('closeout',r/'closeout/raw-private.tar'),('retest',r/'retest/evidence.tar')]:
 expected=None
 if label=='retest':
  m=json.loads((r/'retest/manifest.json').read_bytes());rec=json.loads((r/'retest/receipt.json').read_bytes());assert hashlib.sha256(a.read_bytes()).hexdigest()==rec['archiveSha256'] and a.stat().st_size==rec['archiveBytes'];expected={e['path']:e for e in m['members']}
 with tarfile.open(a) as t:
  members=t.getmembers();seen=set();regular=0
  for i,f in enumerate(members):
   name=PurePosixPath(f.name);assert not name.is_absolute() and '..' not in name.parts and f.name not in seen;seen.add(f.name)
   if f.isdir():continue
   assert f.isfile();b=t.extractfile(f).read();sha=hashlib.sha256(b).hexdigest();regular+=1
   if expected is not None:assert len(b)==expected[f.name]['bytes'] and sha==expected[f.name]['sha256']
   suffix=Path(f.name).suffix if len(Path(f.name).suffix)<8 else '.bin'
   p=r/'extracted'/label/('%04d'%i+suffix);p.parent.mkdir(parents=True,exist_ok=True)
   if p.exists():
    assert p.read_bytes()==b,'Existing evidence differs'
   else:
    p.write_bytes(b)
   idx[f.name]={'local':str(p),'bytes':len(b),'sha256':sha,'batch':label}
  if expected is not None:assert regular==len(expected)==608
 print(json.dumps({'batch':label,'tarMembers':len(members),'filesVerified':regular,'originalArchiveSha256':hashlib.sha256(a.read_bytes()).hexdigest()}))
(r/'index.json').write_bytes((json.dumps(idx,indent=2)+'\n').encode());print('retest interesting',[n for n in idx if idx[n]['batch']=='retest' and any(s in n for s in ['/report.json','quality','retest','batch.json','native.json','budget'])][:30]);print('closeout', [n for n in idx if idx[n]['batch']=='closeout'])
