"""Read-only D27 sealed-set verification. Never extract, install, deploy or normalize bytes."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'tests/release/browser/evidence/final-61df15e'
def sha(data): return hashlib.sha256(data).hexdigest()
def file_sha(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):
            digest.update(chunk)
    return digest.hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prior-worktree', default='../D27-B-work')
    args=parser.parse_args()
    selected=json.loads((BASE/'selected.json').read_bytes())
    prior=Path(args.prior_worktree).resolve()
    output=ROOT/'.local-data/d28-b/archive-verify'/str(uuid4())
    output.mkdir(parents=True)
    report={'task':'D28-B','startedAt':datetime.now(timezone.utc).isoformat(),'status':'RUNNING','nativeExitCode':None,
        'command':[sys.executable,*sys.argv], 'priorWorktreeResolved':str(prior),
        'verifierSha256':sha(Path(__file__).read_bytes()),'sourceCommit':selected['sourceCommit'],
        'extractionPerformed':False,'byteNormalization':False,'currentDeploymentIdentityProved':False}
    try:
        archive=prior/selected['archive']['path']
        image=prior/selected['imageArchive']['path']
        assert file_sha(archive)==selected['archive']['sha256']
        assert file_sha(image)==selected['imageArchive']['sha256']
        tree={}
        for line in subprocess.check_output(['git','ls-tree','-r',selected['sourceCommit']],cwd=ROOT).decode().splitlines():
            meta,path=line.split('\t',1)
            tree[path]=meta.split()[2]
        with tarfile.open(archive) as tar:
            members=tar.getmembers()
            assert len(members)==len({m.name for m in members})
            for member in members:
                assert member.isfile() or member.isdir()
                path=PurePosixPath(member.name)
                assert not path.is_absolute() and '..' not in path.parts
            api_raw=tar.extractfile('api/release.json').read()
            client_raw=tar.extractfile('client/manifest.json').read()
            assert sha(api_raw)==selected['apiManifestSha256']
            assert sha(client_raw)==selected['clientManifestSha256']
            api,client=json.loads(api_raw),json.loads(client_raw)
            assert api['sourceCommit']==client['commit']==selected['sourceCommit']
            for item in api['files']:
                raw=tar.extractfile('api/'+item['path']).read()
                assert len(raw)==item['bytes'] and sha(raw)==item['sha256']
            for path,item in client['files'].items():
                raw=tar.extractfile('client/'+path).read()
                assert len(raw)==item['bytes'] and sha(raw)==item['sha256']
            for item in api['sourceFiles']:
                raw=tar.extractfile('api/'+item['path']).read()
                blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
                assert blob==item['gitBlob']==tree[item['path'].removeprefix('repository/')]
            report.update(apiFilesVerified=len(api['files']),clientFilesVerified=len(client['files']),
                sourceBlobsMatchedExactCommitTree=len(api['sourceFiles']),apiJarSha256=sha(tar.extractfile('api/api.jar').read()),
                apiManifestSha256=sha(api_raw),clientManifestSha256=sha(client_raw))
        report.update(status='PASSED',nativeExitCode=0,archiveSha256=file_sha(archive),imageArchiveSha256=file_sha(image))
    except Exception as error:
        report.update(status='FAILED',nativeExitCode=1,errorType=type(error).__name__)
    report['completedAt']=datetime.now(timezone.utc).isoformat()
    (output/'result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'output':str(output),'status':report['status'],'nativeExitCode':report['nativeExitCode']}))
    return report['nativeExitCode']
if __name__=='__main__': raise SystemExit(main())
