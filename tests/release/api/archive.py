"""Deterministic operator transport archive of the already verified API package."""
import gzip
import io
import json
from pathlib import Path
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/release'))
import api_release as release

candidate = json.loads((ROOT / 'tests/release/api/candidate.json').read_text(encoding='utf-8'))
package = ROOT / candidate['package']
manifest = release.verify(package, candidate['manifestSha256'])
target = ROOT / 'tests/release/api/.private' / ('codeless-api-' + candidate['sourceCommit'] + '.tar.gz')
release.safe(target)
release.require(not target.exists(), 'ARCHIVE_ALREADY_EXISTS')
git_modes = {name: mode for name, _, mode in release.source_files(candidate['sourceCommit'])}
names = [e['path'] for e in manifest['files']] + ['release.json', 'SHA256SUMS']
with target.open('xb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
    with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for name in sorted(names):
            data = (package / name).read_bytes()
            info = tarfile.TarInfo('api/' + name)
            info.size = len(data); info.mtime = 0; info.uid = info.gid = 0
            info.mode = 0o755 if git_modes.get(name.removeprefix('repository/')) == '100755' else 0o644
            tar.addfile(info, io.BytesIO(data))
# Re-open transport bytes and compare every member to the verified directory.
with tarfile.open(target, mode='r:gz') as tar:
    members = tar.getmembers()
    release.require([m.name for m in members] == ['api/' + n for n in sorted(names)], 'ARCHIVE_MEMBERS_MISMATCH')
    for member in members:
        release.require(member.isfile() and tar.extractfile(member).read() == (package / member.name[4:]).read_bytes(), 'ARCHIVE_BYTES_MISMATCH')
result = {'status': 'VERIFIED', 'sourceCommit': manifest['sourceCommit'], 'manifestSha256': candidate['manifestSha256'],
          'archive': target.relative_to(ROOT).as_posix(), 'archiveSha256': release.sha(target.read_bytes()),
          'archiveBytes': target.stat().st_size, 'entries': len(names), 'memberBytesMatchSealedPackage': True,
          'command': ['python', '-B', 'tests/release/api/archive.py'], 'exitCode': 0}
path = ROOT / 'tests/release/api/evidence/artifacts' / candidate['sourceCommit'] / 'artifact-collection.json'
path.parent.mkdir(parents=True, exist_ok=True)
release.require(not path.exists(), 'ARCHIVE_RECEIPT_EXISTS')
path.write_bytes(release.canonical(result))
print(json.dumps(result))
