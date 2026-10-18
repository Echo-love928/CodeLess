#!/usr/bin/python3
"""Read-only operator checks; output only public IDs, hashes and assertions."""
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import uuid
import argparse
import re
from importlib.util import spec_from_file_location, module_from_spec

BASE = Path('/srv/codeless')


def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=True, timeout=15).stdout.strip()


def sql(query):
    return json.loads(run(['docker', 'exec', 'codeless-public-postgres-1', 'psql', '-U', 'codeless', '-d', 'codeless', '-At', '-c', query]))


def main():
    assert os.getuid() == 0
    parser = argparse.ArgumentParser()
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--commit-sha', required=True)
    options = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9-]{1,80}', options.run_id):
        raise ValueError('Invalid acceptance run ID')
    if not re.fullmatch(r'[a-f0-9]{40}', options.commit_sha):
        raise ValueError('Invalid deployed commit SHA')
    public_evidence = BASE / 'public-evidence' / options.run_id
    spec = spec_from_file_location('publication_permissions', Path(__file__).with_name('check-publication-permissions.py'))
    permissions = module_from_spec(spec)
    spec.loader.exec_module(permissions)
    permission_proof = permissions.check()
    proof = json.loads((public_evidence / 'acceptance.json').read_text())
    assert proof['deployedCommit'] == options.commit_sha and proof['freshRun'] is True
    release = json.loads((BASE / 'deployed-release.json').read_text())
    assert release['commit'] == options.commit_sha
    assert release['jarSha256'] == proof['serverJarSha256'] == hashlib.sha256((BASE / 'api.jar').read_bytes()).hexdigest()
    manifest_path = BASE / 'releases' / options.commit_sha / 'source-manifest.json'
    assert hashlib.sha256(manifest_path.read_bytes()).hexdigest() == release['manifestSha256']
    manifest = json.loads(manifest_path.read_text())
    assert manifest['commit'] == options.commit_sha
    for item in manifest['files']:
        path = Path(item['path'])
        assert not path.is_absolute() and '..' not in path.parts
        assert hashlib.sha256((BASE / 'repository' / path).read_bytes()).hexdigest() == item['sha256']
    assert proof['status'] == 'PASSED' and all(proof['checks'].values())
    assert proof['successDeployment']['phase'] == 'SUCCEEDED'
    assert proof['failedDeployment']['failureCode'] == 'DEPLOYMENT_PROBE_FAILED'
    app, good, failed = proof['applicationId'], proof['publication']['id'], proof['failedPublication']['id']
    for identifier in (app, good, failed, proof['versionId'], proof['editedVersionId']):
        assert str(uuid.UUID(identifier)) == identifier
    rows = sql("SELECT json_build_object('id',p.id,'status',p.status,'url',p.url,'versionId',p.version_id,"
               "'ownerMatches',p.requested_by=a.owner_id,'versionStatus',v.status,'buildStatus',b.status,"
               "'buildExit',b.exit_code,'artifactDigest',b.artifact_digest,'sourceDigest',v.source_digest,"
               "'latestReadyVersionId',a.latest_ready_version_id) FROM publications p "
               "JOIN applications a ON a.id=p.application_id JOIN application_versions v ON v.id=p.version_id "
               "JOIN builds b ON b.id=v.build_id WHERE p.id='" + good + "'")
    assert rows['id'] == good and rows['status'] == 'PUBLISHED' and rows['url'] == proof['publication']['url']
    assert rows['ownerMatches'] and rows['versionId'] == proof['versionId']
    assert rows['versionStatus'] == 'VERIFIED' and rows['buildStatus'] == 'SUCCEEDED' and rows['buildExit'] == 0
    assert rows['artifactDigest'] == proof['artifactDigest'] and rows['sourceDigest'] == proof['sourceDigest']
    assert rows['latestReadyVersionId'] == proof['editedVersionId'] != rows['versionId']
    failure = sql("SELECT json_build_object('status',status,'url',url) FROM publications WHERE id='" + failed + "'")
    assert failure == {'status': 'FAILED', 'url': None}
    counts = sql("SELECT json_build_object('successful',count(*) FILTER(WHERE status='PUBLISHED'),"
                 "'pending',count(*) FILTER(WHERE status='REQUESTED'),'total',count(*)) FROM publications "
                 "WHERE application_id='" + app + "'")
    assert counts['successful'] == 1 and counts['pending'] == 0
    latest = sql("SELECT json_build_object('id',id) FROM publications WHERE application_id='" + app +
                 "' AND status='PUBLISHED' ORDER BY published_at DESC,id DESC LIMIT 1")
    assert latest['id'] == good
    for role in ('codeless-api', 'codeless-preview'):
        user = pwd.getpwnam(role)
        assert grp.getgrnam('docker').gr_gid not in os.getgrouplist(role, user.pw_gid)
        for path in ('/run/docker.sock', '/etc/codeless/tls/server.key'):
            assert subprocess.run(['/usr/sbin/runuser', '-u', role, '--', 'test', '-r', path]).returncode != 0
    assert grp.getgrnam('codeless-ipc').gr_gid not in os.getgrouplist('codeless-preview', pwd.getpwnam('codeless-preview').pw_gid)
    for service in ('codeless-api', 'codeless-worker', 'codeless-preview', 'codeless-backend-firewall', 'codeless-reap.timer'):
        assert run(['systemctl', 'is-active', service]) == 'active'
    for name in ('edge', 'platform', 'hosting'):
        config = json.loads(run(['docker', 'inspect', 'codeless-public-' + name + '-1']))[0]
        assert config['State']['Running'] and config['HostConfig']['ReadonlyRootfs']
        assert config['Config']['User'].split(':')[0] == '101'
        assert config['HostConfig']['CapDrop'] == ['ALL']
        assert all('docker.sock' not in item['Source'] for item in config['Mounts'])
        if name == 'edge':
            assert config['NetworkSettings']['Ports']['8443/tcp'] == [{'HostIp': '0.0.0.0', 'HostPort': '443'}]
        else:
            assert all(value is None for value in config['NetworkSettings']['Ports'].values())
    database = json.loads(run(['docker', 'inspect', 'codeless-public-postgres-1']))[0]
    assert database['State']['Health']['Status'] == 'healthy'
    assert all(value is None for value in database['NetworkSettings']['Ports'].values())
    for tree in ('source', 'outcome'):
        root = BASE / 'private/agent/versions' / proof['versionId'] / tree
        for path in (root, *root.rglob('*')):
            assert not path.is_symlink()
            assert stat.S_IMODE(path.stat().st_mode) == (0o750 if path.is_dir() else 0o640)
    directory = BASE / 'publication/sites' / good
    for file in proof['publishedFiles']:
        path = directory / file['path']
        assert stat.S_IMODE(path.stat().st_mode) == 0o644
        assert 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest() == file['digest']
    assert stat.S_IMODE((directory / '__deployment.json').stat().st_mode) == 0o600
    assert not (BASE / 'publication/sites' / failed).exists()
    assert (BASE / 'private/deployment-checks' / failed).is_dir()
    assert not run(['docker', 'ps', '-aq', '--filter', 'label=codeless.worker-job'])
    hashes = {}
    for name in ('infra/public/worker.py', 'infra/public/worker-client.py', 'infra/public/docker-job.py',
                 'infra/public/reap.py', 'services/runner/src/publish/store.mjs'):
        hashes[name] = hashlib.sha256((BASE / 'repository' / name).read_bytes()).hexdigest()
    result = {'status': 'PASSED', 'sqlFrozenVersionBuildAndOwnerMatched': True, 'latestSuccessUnchanged': True,
              'oneSuccessfulLogicalPublication': True, 'publicationCounts': counts, 'rolesAndContainersIsolated': True,
              'privateSnapshotsAndReceiptModesVerified': True, 'failedAttemptNotPublic': True, 'noOwnedContainersLeft': True,
              'serverJarSha256': hashlib.sha256((BASE / 'api.jar').read_bytes()).hexdigest(),
              'sourceHashes': hashes, 'publicationId': good, 'failedPublicationId': failed,
              'publicationPermissions': permission_proof, 'deployedCommit': options.commit_sha,
              'sourceFilesVerified': len(manifest['files']),
              'publicMilestoneReached': False}
    (public_evidence / 'server-final.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
