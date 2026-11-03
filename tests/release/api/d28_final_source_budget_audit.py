"""D28-A read-only original-evidence verifier. No models, HTTP, Docker or deployment writes.
Use the fixed original private intake layout documented in D28-B-FINAL-REVIEW.md.
Only derived audit outputs are written; raw originals are not modified.
"""
import argparse,os
from pathlib import Path
import json,hashlib,subprocess,decimal
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',required=True);parser.add_argument('--anchor',required=True);args=parser.parse_args();os.chdir(Path(__file__).resolve().parents[3]);r=Path(args.root).resolve();assert r.is_relative_to(Path(__file__).resolve().parents[3]/'tests/release/api/.private'),'Use a Git-ignored private intake root';raw=json.loads((r/'server-group-and-chain-raw.json').read_bytes());state=json.loads(raw['ledger']['row'][0]);head=raw['ledger']['row'][1];prior='0'*64;events=raw['ledger']['events'];old=json.loads(Path(args.anchor).read_bytes())
for seq,payload,previous,digest in events:
 assert seq==events.index([seq,payload,previous,digest])+1 and previous==prior and digest==hashlib.sha256((previous+payload).encode()).hexdigest();prior=digest
assert head==prior and len(events)==state['revision']==43
canonical=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
print('canonical local probe hash',hashlib.sha256(canonical(state)).hexdigest(),'lastExpected',json.loads(events[-1][1])['stateSha256'])
assert hashlib.sha256(canonical(state)).hexdigest()==json.loads(events[-1][1])['stateSha256']
assert events[31][3]==old['eventHeadSha256'] and state['ledgerId']==old['ledgerId']
assert [hashlib.sha256(canonical(e)).hexdigest() for e in state['entries'][:14]]==old['priorEntryCanonicalSha256'] and state['active'] is None
assert sum(e['upperNanos'] for e in state['entries'])==1547654000
assert sum(e['upperNanos'] for e in state['entries'] if e['state']=='SETTLED_UNKNOWN')==400000000
api=json.loads((r/'candidate/api/release.json').read_bytes());checked=[]
for f in api['sourceFiles']:
 path=f['path'].removeprefix('repository/');b=subprocess.check_output(['git','-c','safe.directory='+Path.cwd().as_posix(),'show','1fe1389:'+path]);assert hashlib.sha256(b).hexdigest()==f['sha256'],path;checked.append(path)
result={'sourceCommit':'1fe1389dee23efbb1b43c30f3ec1b8f546413087','gitSourceFilesVerified':len(checked),'independentlyVerifiedLedgerEvents':len(events),'prior32HeadAnchored':True,'old14EntriesByteEquivalent':True,'unknownHeldCny':'0.4','settledUpperCny':'1.547654','newRetestUpperCny':'0.29258','spendableCny':'0.452346','actualBill':None,'nativeExitCode':0};(r/'source-and-budget-audit.json').write_bytes((json.dumps(result,indent=2)+'\n').encode());print(json.dumps(result))
