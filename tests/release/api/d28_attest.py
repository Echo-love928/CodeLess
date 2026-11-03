"""Independent raw-byte attestation of the explicitly selected new D28 API."""
from datetime import datetime, timezone
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'tests/release/api'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', default='tests/release/api/d28-candidate.json')
    parser.add_argument('--output', default='tests/release/api/evidence/d28/candidate-attestation.json')
    args = parser.parse_args()
    selected_path = (ROOT / args.candidate).resolve()
    output = (ROOT / args.output).resolve()
    if not selected_path.is_relative_to(BASE) or not output.is_relative_to(BASE / 'evidence'):
        parser.error('Require task-owned registry and public evidence path')
    if args.output != parser.get_default('output') and output.exists():
        parser.error('Refuse evidence overwrite')
    selected = json.loads(selected_path.read_text(encoding='utf-8'))
    package = (ROOT / selected['package']).resolve()
    head = selected['sourceCommit']
    report = {'task': 'D28-A', 'candidate': head, 'command': [sys.executable, '-B', 'tests/release/api/d28_attest.py', *sys.argv[1:]],
              'startedAt': datetime.now(timezone.utc).isoformat(), 'checks': [], 'status': 'RUNNING', 'exitCode': None}
    try:
        assert re.fullmatch('[0-9a-f]{40}', head) and package.is_relative_to(BASE / '.private/d28')
        manifest_bytes = (package / 'release.json').read_bytes()
        assert sha(manifest_bytes) == selected['manifestSha256']
        manifest = json.loads(manifest_bytes)
        assert manifest['sourceCommit'] == head
        report['checks'].append('EXTERNAL_MANIFEST_AND_CANDIDATE_MATCH')
        for item in manifest['sourceFiles']:
            assert item['path'].startswith('repository/')
            path = item['path'][len('repository/'):]
            raw = subprocess.check_output(['git', '-c', 'safe.directory=' + ROOT.as_posix(), 'show', head + ':' + path], cwd=ROOT)
            actual = (package / item['path']).read_bytes()
            assert actual == raw and sha(raw) == item['sha256']
            assert hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == item['gitBlob']
        report['sourceBlobsVerified'] = len(manifest['sourceFiles'])
        report['checks'].append('ALL_SEALED_SOURCE_BYTES_EXACT_GIT_BLOBS')
        jar = (package / 'api.jar').read_bytes()
        assert sha(jar) == selected['apiJarSha256']
        report['apiJarSha256'] = sha(jar)
        migrations = []
        with zipfile.ZipFile(package / 'api.jar') as archive:
            assert 'BOOT-INF/classes/dev/codeless/api/CodeLessApiApplication.class' in archive.namelist()
            for item in manifest['sourceFiles']:
                prefix = 'repository/services/api/src/main/resources/'
                if item['path'].startswith(prefix + 'db/migration/'):
                    relative = item['path'][len(prefix):]
                    assert archive.read('BOOT-INF/classes/' + relative) == (package / item['path']).read_bytes()
                    migrations.append(relative)
        assert len(migrations) == 5
        report.update(jarMigrationsExact=migrations, manifestSha256=sha(manifest_bytes))
        report['checks'].append('SEALED_PRODUCTION_JAR_AND_FIVE_MIGRATIONS_EXACT')
        report.update(status='PASSED', exitCode=0)
    except Exception as error:
        report.update(status='FAILED', exitCode=1, errorType=type(error).__name__)
    report['finishedAt'] = datetime.now(timezone.utc).isoformat()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))
    return report['exitCode']


if __name__ == '__main__':
    sys.exit(main())
