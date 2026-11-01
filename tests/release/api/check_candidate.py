"""Independent release attestation: candidate hashes, Git blobs, JAR migrations."""
import hashlib
import json
from pathlib import Path
import re
import sys
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/release'))
import api_release as release

candidate = json.loads((ROOT / 'tests/release/api/candidate.json').read_text(encoding='utf-8'))
package = ROOT / candidate['package']
manifest = release.verify(package, candidate['manifestSha256'])
revision = manifest['sourceCommit']
release.require(revision == candidate['sourceCommit'], 'CANDIDATE_COMMIT_MISMATCH')
source_files = {name: (blob, mode) for name, blob, mode in release.source_files(revision)}
release.require(len(source_files) == len(manifest['sourceFiles']), 'SOURCE_SET_MISMATCH')
for entry in manifest['sourceFiles']:
    name = entry['path'].removeprefix('repository/')
    data = (package / entry['path']).read_bytes()
    blob = source_files[name][0]
    release.require(entry['gitBlob'] == blob and release.sha(data) == entry['sha256'] and
                    hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == blob,
                    'SOURCE_NOT_EXACT_GIT_BLOB')
jar = package / 'api.jar'
release.require(release.sha(jar.read_bytes()) == candidate['apiJarSha256'], 'JAR_MISMATCH')
migrations = []
with zipfile.ZipFile(jar) as archive:
    for name in source_files:
        resource = 'services/api/src/main/resources/'
        if name.startswith(resource + 'db/migration/'):
            relative = name.removeprefix(resource)
            release.require(archive.read('BOOT-INF/classes/' + relative) == (package / 'repository' / name).read_bytes(), 'JAR_MIGRATION_MISMATCH')
            migrations.append(relative)
    release.require(len(migrations) == 5, 'UNEXPECTED_MIGRATION_SET')
    release.require('BOOT-INF/classes/dev/codeless/api/CodeLessApiApplication.class' in archive.namelist(), 'PRODUCTION_MAIN_MISSING')
transport = ROOT / candidate['archive']
release.require(release.sha(transport.read_bytes()) == candidate['archiveSha256'], 'ARCHIVE_MISMATCH')
with tarfile.open(transport, 'r:gz') as archive:
    for member in archive:
        release.require(member.isfile() and member.name.startswith('api/'), 'UNSAFE_ARCHIVE_MEMBER')
        name = member.name[4:]; release.portable(name)
        release.require(archive.extractfile(member).read() == (package / name).read_bytes(), 'ARCHIVE_MEMBER_MISMATCH')
inventory = {}
for name in source_files:
    if name.startswith(('services/api/src/main/', 'services/runner/src/')) or name == 'infra/public/install-runtime.py':
        if name.endswith(('.java', '.mjs', '.yml', '.py')):
            text = (package / 'repository' / name).read_text(encoding='utf-8')
            for key in set(re.findall(r'\b(?:CODELESS_[A-Z0-9_]+|SPRING_APPLICATION_JSON)\b', text)):
                inventory.setdefault(key, []).append(name)
image_sources = ('infra/public/compose.yml', 'infra/build-image/Dockerfile')
images = {name: [line.strip() for line in (package / 'repository' / name).read_text(encoding='utf-8').splitlines()
                 if re.match(r'\s*(?:image:|FROM )', line)] for name in image_sources}
public = ROOT / 'tests/release/api/evidence/artifacts' / revision
public.mkdir(parents=True, exist_ok=True)
(public / 'configuration-inventory.json').write_bytes(release.canonical({
    'sourceCommit': revision, 'source': 'fixed Git source bytes in verified package; no live environment values read',
    'environmentNamesAndSourceReferences': dict(sorted(inventory.items())), 'lockedImageDeclarations': images,
    'operatorConfiguration': 'infra/release/api/configuration.json',
    'propertySettings': 'infra/public/install-runtime.py SPRING_APPLICATION_JSON and docs/operations.md'}))
result = {'status': 'PASSED', 'command': ['python', '-B', 'tests/release/api/check_candidate.py'], 'exitCode': 0,
          'sourceCommit': revision, 'manifestSha256': candidate['manifestSha256'], 'apiJarSha256': candidate['apiJarSha256'],
          'archiveSha256': candidate['archiveSha256'], 'gitSourceBlobsVerified': len(source_files),
          'jarMigrationsExact': sorted(migrations), 'archiveMemberBytesVerified': True,
          'configurationInventorySha256': release.sha((public / 'configuration-inventory.json').read_bytes())}
(public / 'candidate-attestation.json').write_bytes(release.canonical(result))
print(json.dumps(result))
