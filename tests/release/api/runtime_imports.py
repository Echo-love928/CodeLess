"""Real Node module resolution from the sealed runtime, without launching jobs."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/release'))
import api_release as release

candidate = json.loads((ROOT / 'tests/release/api/candidate.json').read_text(encoding='utf-8'))
package = ROOT / candidate['package']
release.verify(package, candidate['manifestSha256'])
stamp = datetime.now(timezone.utc).isoformat().replace(':', '-') + '-runtime-imports'
output = ROOT / 'tests/release/api/evidence' / stamp
output.mkdir(parents=True)
targets = ['services/runner/src/preview/main.mjs', 'services/runner/src/verify/workflow.mjs',
           'services/runner/src/publish/frozen-gateway.mjs', 'services/runner/src/screenshot/capture.mjs']
env = {k: v for k, v in os.environ.items() if not k.upper().startswith(('CODELESS_', 'NODE_OPTIONS'))}
records = []
with (output / 'command.log').open('xb') as log:
    for name in targets:
        command = ['node', '--input-type=module', '-e',
                   "import {pathToFileURL} from 'node:url'; const target=process.argv[1]; process.argv[1]=''; await import(pathToFileURL(target));",
                   str(package / 'repository' / name)]
        r = subprocess.run(command, env=env, capture_output=True, timeout=30, cwd=ROOT)
        raw = r.stdout + r.stderr
        log.write(name.encode() + b'\n' + raw)
        records.append({'module': name, 'command': command, 'nativeExitCode': r.returncode, 'outputSha256': release.sha(raw)})
code = next((r['nativeExitCode'] for r in records if r['nativeExitCode'] != 0), 0)
report = {'status': 'PASSED' if code == 0 else 'FAILED', 'exitCode': code, 'sourceCommit': candidate['sourceCommit'],
          'apiManifestSha256': candidate['manifestSha256'], 'records': records,
          'logSha256': release.sha((output / 'command.log').read_bytes()),
          'scope': 'real static module resolution; no worker/browser launch, external request or model call'}
(output / 'result.json').write_bytes(release.canonical(report))
print(json.dumps({'status': report['status'], 'exitCode': code, 'evidence': output.relative_to(ROOT).as_posix(),
                  'moduleExits': {r['module']: r['nativeExitCode'] for r in records}}))
sys.exit(code)
