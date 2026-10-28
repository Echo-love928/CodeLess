"""Publish whitelisted fixture proof; never publish backups, sessions or API logs."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'tests/backup/.private/application'
RUNS = ROOT / 'tests/backup/.private/runs'
PUBLIC = ROOT / 'tests/backup/evidence'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha(path):
    return 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()


attempts = []
latest = None
for command in sorted(RUNS.glob('*-application/command.log')):
    latest = None
    meta_path = PUBLIC / command.parent.name / 'command.json'
    if not meta_path.exists():
        continue
    meta = read(meta_path)
    terminal = None
    for line in reversed(command.read_text(encoding='utf-8', errors='replace').splitlines()):
        try:
            row = json.loads(line)
            if row.get('task') == 'D23-A' and 'output' in row:
                terminal = row
                break
        except (json.JSONDecodeError, AttributeError):
            continue
    if terminal is None:
        attempts.append({'commandEvidence': meta_path.parent.relative_to(ROOT).as_posix(),
                         'exitCode': meta['exitCode'], 'status': 'NO_APPLICATION_TERMINAL'})
        continue
    job = Path(terminal['output']).absolute()
    assert job.is_relative_to(BASE.absolute()) and job != BASE.absolute()
    report = read(job / 'application.json')
    attempts.append({'commandEvidence': meta_path.parent.relative_to(ROOT).as_posix(),
                     'runtimeRevision': report['runtimeRevision'], 'exitCode': meta['exitCode'],
                     'status': report['status'], 'applicationAcceptance': report.get('applicationAcceptance', 'NOT_RUN'),
                     'lastStorageAction': report['commands'][-1]['action'] if report['commands'] else None,
                     'cleanupErrors': len(report['cleanupErrors']), 'privateReportSha256': sha(job / 'application.json')})
    latest = (job, report, meta, meta_path)

(PUBLIC / 'application-attempts.json').write_text(json.dumps(attempts, indent=2) + '\n', encoding='utf-8', newline='\n')
assert latest, 'Latest application run has no completed report; failures preserved'
job, r, meta, meta_path = latest
assert meta['exitCode'] == 0 and r['status'] == 'PASSED', 'Latest application run failed; do not substitute an older success'
for source in ['scripts/backup/backup.py', 'tests/backup/application_storage.py',
               'tests/backup/test_application.mjs', 'tests/backup/application_support.mjs', 'tests/backup/record.py']:
    assert sha(ROOT / source) == 'sha256:' + meta['sourceDigests'][source], 'Tested runtime source changed: ' + source
assert r['applicationAcceptance'] == 'PASSED' and not r['cleanupErrors']
assert r['sourceClusterDestroyedBeforeRestore'] and r['cleanSourceDatabase'] == 0 and r['emptyTargetDatabase'] == 0
assert r['sourceClusterIdentity'] != r['targetClusterIdentity']
assert r['sourceProcesses']['runtimeJarSha256'] == r['restoredProcesses']['runtimeJarSha256']
assert r['restoredProcesses']['apiMain'] == 'production'
assert r['negativeControl']['rejection'] == 'RESTORE_FILES_MISMATCH'
assert r.get('originalImageAliasRestored') is True or r.get('imageAliasNoPreviousState') is True
assert (job / 'source.zip').read_bytes() == (job / 'restored.zip').read_bytes()
assert sha(job / 'restored.zip') == r['restoredExportSha256'] == r['sourceExportSha256']
assert r['cleanBuildExitCode'] == 0 and r['cleanBuildSignal'] is None
assert r['cleanBuild']['status'] == 'PASSED' and r['cleanBuild']['reproduction'] == 'REPRODUCED'
assert r['cleanBuild']['artifactReproduced'] is True and r['cleanBuild']['distDigest'] == r['binding']['artifactDigest']
assert r['cleanBuild']['archiveDigest'] == sha(job / 'restored.zip')
assert r['cleanBuild']['logDigest'] == sha(job / 'clean-build/clean-build.log')

out = meta_path.parent
for name, source in [('source-preview.png', job / 'source-preview.png'),
                     ('restored-preview.png', job / 'restored-preview.png'),
                     ('restored-export.zip', job / 'restored.zip'),
                     ('clean-build.json', job / 'clean-build/clean-build.json'),
                     ('clean-build.log', job / 'clean-build/clean-build.log')]:
    shutil.copyfile(source, out / name)
verified = subprocess.run(['node', 'tests/export/verify-export.mjs', str(out / 'restored-export.zip')],
                          cwd=ROOT, capture_output=True, check=False)
assert verified.returncode == 0
validation = json.loads(verified.stdout)
assert validation['status'] == 'PASSED'
(out / 'verify-export.json').write_bytes(verified.stdout)

frozen = read(job / 'backup/data/agent/versions' / r['binding']['versionId'] / 'outcome/manifest.json')
safe = {'task': 'D23-A', 'status': 'PASSED', 'applicationAcceptance': 'PASSED',
        'runtimeRevision': r['runtimeRevision'], 'harnessWorktreeSourceDigests': meta['sourceDigests'],
        'startedAt': r['startedAt'], 'finishedAt': r['finishedAt'], 'commandExitCode': meta['exitCode'],
        'modelProvider': r['modelProvider'], 'newPaidModelRequests': 0, 'runtimeMockUsage': r.get('sourceMockModelUsage', 'UNKNOWN'),
        'environment': r['environment'], 'supervisor': r['supervisor'], 'publicAcceptance': False,
        'binding': {**r['binding'], 'reportDigest': frozen['reportDigest']},
        'sameApiJarSha256': r['sourceProcesses']['runtimeJarSha256'],
        'sourceWritersStoppedBeforeBackup': r['sourceWritersStoppedBeforeBackup'],
        'sourceProcessExit': r['sourceProcessExit'],
        'sourceClusterDestroyedBeforeRestore': True, 'sourceAndTargetClusterIdentifiersDifferent': True,
        'emptyTargetUserObjects': r['emptyTargetDatabase'], 'sourceRootDirectoriesReplaced': r['quarantine']['roots'],
        'originalAbsolutePathsVerified': r['activation']['status'] == 'RESTORED_DATA_VERIFIED',
        'offlineMarkerApplicationAcceptance': r['offlineRestore']['applicationAcceptance'],
        'originalOwnerLoginAfterRestore': r['originalOwnerLoginAfterRestore'],
        'existingPreviewAndRefreshAfterRestore': r['existingPreviewAndRefreshAfterRestore'],
        'existingPublicationServesRestoredBytes': r['existingPublicationServesRestoredBytes'],
        'sourceAndRestoredArchivesIdentical': True, 'exportArchiveSha256': sha(out / 'restored-export.zip'),
        'negativeControl': r['negativeControl'], 'referenceTables': r['postBrowserConsistency']['referenceTables'],
        'cleanBuild': {k: r['cleanBuild'][k] for k in ['status', 'exitCode', 'archiveDigest', 'logDigest',
            'reproduction', 'artifactReproduced', 'hostProjectUnchanged', 'hostNodeModulesCreated', 'distDigest', 'image', 'user']},
        'originalImageAliasRestored': r.get('originalImageAliasRestored'),
        'imageAliasNoPreviousState': r.get('imageAliasNoPreviousState', False), 'cleanupErrors': [],
        'privateBackupManifestSha256': sha(job / 'backup/manifest.json'),
        'privateDatabaseDumpSha256': sha(job / 'backup/database.dump'),
        'privateOriginalReportSha256': sha(job / 'application.json'),
        'commands': r['commands'], 'D23-A-T1': 'PASSED', 'D23-A-T4': 'PASSED',
        'publishedArtifacts': {name: sha(out / name) for name in ['command.json', 'source-preview.png',
            'restored-preview.png', 'restored-export.zip', 'clean-build.json', 'clean-build.log', 'verify-export.json']}}
(out / 'application-summary.json').write_text(json.dumps(safe, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'status': 'PASSED', 'evidence': out.relative_to(ROOT).as_posix(),
                  'T4': 'PASSED', 'cleanBuildReproduction': 'REPRODUCED', 'attemptsPreserved': len(attempts)}))
