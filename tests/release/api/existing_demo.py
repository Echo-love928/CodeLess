"""Read-only D23 backup input -> independent PG -> D27 production JAR read/export.

This is retained, genuinely generated D23 demo data, not the synthetic V4 edge
fixture. Read/source/export use a staging root; journal absolute-path previews and
production Linux activation are intentionally not exercised or altered here.
"""
from datetime import datetime, timezone
import argparse
import http.cookiejar
import importlib.util
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/release'))
import api_release as release
from live import PG


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup', required=True)
    parser.add_argument('--source-evidence', required=True)
    args = parser.parse_args()
    backup_path = Path(args.backup).absolute()
    summary_path = Path(args.source_evidence).absolute()
    summary = json.loads(summary_path.read_text(encoding='utf-8'))
    candidate = json.loads((ROOT / 'tests/release/api/candidate.json').read_text(encoding='utf-8'))
    package = ROOT / candidate['package']
    manifest = release.verify(package, candidate['manifestSha256'])
    stamp = datetime.now(timezone.utc).isoformat().replace(':', '-') + '-existing-demo'
    output = ROOT / 'tests/release/api/.private/runs' / stamp
    public = ROOT / 'tests/release/api/evidence' / stamp
    output.mkdir(parents=True); public.mkdir(parents=True)
    report = {'task': 'D27-A', 'case': 'T2-existing-real-generated-D23-demo', 'status': 'RUNNING',
              'startedAt': datetime.now(timezone.utc).isoformat(), 'sourceCommit': manifest['sourceCommit'],
              'manifestSha256': candidate['manifestSha256'], 'apiJarSha256': candidate['apiJarSha256'],
              'history': 'retained D23 real generation/build/browser demo; original model deterministic-mock',
              'sourceEvidence': summary_path.relative_to(ROOT).as_posix(), 'sourceEvidenceSha256': release.sha(summary_path.read_bytes()),
              'modelProvider': 'deterministic-mock', 'newModelRequests': 0, 'paidModelRequests': 0,
              'previewAcceptance': 'NOT_RUN_STAGING_PATHS', 'productionAcceptance': False,
              'checks': [], 'commands': [], 'cleanupErrors': []}
    def checked(name, condition):
        release.require(condition, name); report['checks'].append(name)
    def command(argv, operation):
        result = subprocess.run(argv, capture_output=True, timeout=180)
        report['commands'].append({'operation': operation, 'exitCode': result.returncode,
                                   'stdoutSha256': release.sha(result.stdout), 'stderrSha256': release.sha(result.stderr)})
        release.require(result.returncode == 0, 'FAILED_' + operation)
        return result.stdout.decode().strip()
    spec = importlib.util.spec_from_file_location('d27_demo_backup', ROOT / 'scripts/backup/backup.py')
    backup = importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)
    api, container = None, None
    def input_hashes():
        return {p.relative_to(backup_path).as_posix(): release.sha(p.read_bytes()) for p in backup_path.rglob('*') if p.is_file()}
    original = {}
    try:
        jdk = Path(os.environ.get('JAVA_HOME', ROOT / '.local-data/d07-a/tools/java21/jdk-21.0.12.1+1'))
        java = jdk / 'bin' / ('java.exe' if os.name == 'nt' else 'java')
        version = subprocess.run([str(java), '-version'], capture_output=True, timeout=10)
        checked('LOCKED_JAVA21', version.returncode == 0 and b'version "21.' in version.stdout + version.stderr)
        checked('D23_SOURCE_ACCEPTANCE_PASSED', summary['status'] == 'PASSED' and summary['applicationAcceptance'] == 'PASSED' and summary['commandExitCode'] == 0)
        checked('D23_BACKUP_MANIFEST_IDENTITY', 'sha256:' + release.sha((backup_path / 'manifest.json').read_bytes()) == summary['privateBackupManifestSha256'])
        checked('D23_DATABASE_DUMP_IDENTITY', 'sha256:' + release.sha((backup_path / 'database.dump').read_bytes()) == summary['privateDatabaseDumpSha256'])
        saved = backup.verify(backup_path)
        original = input_hashes()
        binding = summary['binding']; report['binding'] = binding
        report['sourceBackupId'] = saved['id']; report['sourceBackupManifestSha256'] = summary['privateBackupManifestSha256']
        name = 'codeless-d27-existing-demo-' + str(uuid.uuid4())
        fixture_password = secrets.token_urlsafe(32)
        command(['docker', 'run', '-d', '--name', name, '--label', 'codeless.d27-existing-demo=true',
                 '--memory', '384m', '--cpus', '0.5', '--pids-limit', '128', '-p', '127.0.0.1::5432',
                 '-e', 'POSTGRES_USER=d27_fixture', '-e', 'POSTGRES_DB=d27_fixture', '-e', 'POSTGRES_PASSWORD=' + fixture_password, PG], 'create-owned-pg')
        container = name
        deadline = time.monotonic() + 60
        while True:
            result = subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', 'd27_fixture', '-d', 'd27_fixture'], capture_output=True, timeout=5)
            if result.returncode == 0: break
            release.require(time.monotonic() < deadline, 'PG_NOT_READY'); time.sleep(.2)
        db = {'container': name, 'database': 'd27_fixture', 'user': 'd27_fixture'}
        pg = backup.Pg(db)
        class NeverStartedOwnedApi:
            def check(self): release.require(api is None, 'OWNED_API_NOT_STOPPED')
        restored = backup.restore(db, backup_path, output / 'restored', 64 * 1024 * 1024, NeverStartedOwnedApi())
        checked('D23_FULL_DATABASE_AND_FILES_RESTORED', restored['applicationAcceptance'] == 'NOT_RUN')
        before = pg.inventory()
        checked('V5_SCHEMA_BEFORE_CANDIDATE', pg.sql('SELECT max(version) FROM flyway_schema_history WHERE success;') == '5')
        ports = json.loads(command(['docker', 'inspect', '--format', '{{json .NetworkSettings.Ports}}', name], 'pg-port-binding'))
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
        base = 'http://127.0.0.1:' + str(port)
        env = {k: v for k, v in os.environ.items() if not k.upper().startswith(('CODELESS_', 'SPRING_', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS'))}
        env.update(CODELESS_DATABASE_URL='jdbc:postgresql://127.0.0.1:' + ports['5432/tcp'][0]['HostPort'] + '/d27_fixture',
                   CODELESS_DATABASE_USER='d27_fixture', CODELESS_DATABASE_PASSWORD=fixture_password,
                   CODELESS_MODEL_PROVIDER='deterministic-mock', CODELESS_COOKIE_SECURE='false',
                   CODELESS_MODEL_AUDIT_ROOT=str(output / 'audit/model'), CODELESS_FILE_AUDIT_ROOT=str(output / 'audit/file'))
        params = ['--server.address=127.0.0.1', '--server.port=' + str(port), '--codeless.tasks.enabled=false',
                  '--codeless.agent.enabled=false', '--codeless.deploy.worker-enabled=false', '--codeless.recovery.sweep-enabled=false',
                  '--codeless.cover.enabled=false', '--codeless.agent.private-root=' + str(output / 'restored/agent'),
                  '--codeless.export.repository-root=' + str(package / 'repository')]
        with (output / 'api.log').open('xb') as log:
            api = subprocess.Popen([str(java), '-Xms64m', '-Xmx384m', '-jar', str(package / 'api.jar'), *params],
                                   cwd=output, env=env, stdout=log, stderr=subprocess.STDOUT)
        def client(): return urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def request(browser, path, method='GET', data=None, token=None):
            headers = {'Content-Type': 'application/json'}
            if token: headers['X-CSRF-Token'] = token
            req = urllib.request.Request(base + '/api/v0/' + path, method=method, headers=headers,
                                         data=None if data is None else json.dumps(data).encode())
            try: r = browser.open(req, timeout=5)
            except urllib.error.HTTPError as e: r = e
            with r: return r.status, r.read(), dict(r.headers)
        deadline = time.monotonic() + 75
        browser = client()
        while True:
            release.require(api.poll() is None, 'CANDIDATE_API_EXITED')
            try:
                code, raw, _ = request(browser, 'auth/csrf')
                if code == 200: break
            except (OSError, urllib.error.URLError): pass
            release.require(time.monotonic() < deadline, 'CANDIDATE_API_TIMEOUT'); time.sleep(.2)
        checked('D27_PRODUCTION_MAIN_STARTS_ON_EXISTING_V5', True)
        code, _, _ = request(browser, 'auth/login', 'POST', {'email': 'demo@codeless.local', 'password': 'demo-password-for-test-only'}, json.loads(raw)['token'])
        checked('ORIGINAL_DEMO_CREDENTIALS_LOGIN', code == 200)
        version = binding['versionId']
        code, raw, _ = request(browser, 'versions/' + version)
        detail = json.loads(raw)
        checked('EXISTING_VERIFIED_VERSION_AND_BUILD', code == 200 and detail['id'] == version and detail['status'] == 'VERIFIED' and
                detail['buildId'] == binding['buildId'] and detail['sourceDigest'] == binding['sourceDigest'])
        code, raw, _ = request(browser, 'versions/' + version + '/files')
        files = json.loads(raw)
        checked('EXISTING_SOURCE_FILES', code == 200 and files['versionId'] == version and files['sourceDigest'] == binding['sourceDigest'] and len(files['files']) > 0)
        for entry in files['files']:
            code, raw, _ = request(browser, 'versions/' + version + '/files/content?path=' + urllib.parse.quote(entry['path']))
            value = json.loads(raw)
            checked('EXISTING_SOURCE_CONTENT_DIGEST', code == 200 and 'sha256:' + release.sha(value['content'].encode()) == entry['digest'])
        code, raw, _ = request(browser, 'applications/' + binding['applicationId'] + '/versions')
        checked('EXISTING_LATEST_READY_POINTER', code == 200 and json.loads(raw)['latestReadyVersionId'] == version)
        code, raw, _ = request(browser, 'publications/' + binding['publicationId'])
        checked('EXISTING_PUBLICATION', code == 200 and json.loads(raw)['versionId'] == version and json.loads(raw)['status'] == 'PUBLISHED')
        code, raw, headers = request(browser, 'versions/' + version + '/export')
        checked('EXISTING_EXPORT_HTTP', code == 200 and headers.get('Content-Type') == 'application/zip')
        checked('EXISTING_EXPORT_IDENTICAL_TO_D23_BYTES', 'sha256:' + release.sha(raw) == summary['exportArchiveSha256'])
        report['exportArchiveSha256'] = 'sha256:' + release.sha(raw)
        (output / 'restored-export.zip').write_bytes(raw)
        checked('ANONYMOUS_VERSION_401', request(client(), 'versions/' + version)[0] == 401)
        checked('REFERENCE_TABLES_UNCHANGED_BY_CANDIDATE', before == pg.inventory())
        checked('MIGRATIONS_VALIDATED_WITHOUT_NEW_SCHEMA', pg.sql('SELECT count(*) FROM flyway_schema_history;') == '5')
        checked('D23_INPUT_BACKUP_BYTES_UNCHANGED', original == input_hashes())
        report.update(status='PASSED', T2='PASSED_EXISTING_REAL_GENERATED_DEMO_V5_COMPATIBILITY')
    except Exception as e:
        import traceback
        (output / 'failure-private.txt').write_text(traceback.format_exc(), encoding='utf-8')
        report.update(status='FAILED', errorCode=str(e) if isinstance(e, ValueError) else type(e).__name__)
    finally:
        if api is not None:
            try:
                if api.poll() is None: api.terminate()
                api.wait(timeout=25)
            except Exception as e: report['cleanupErrors'].append(type(e).__name__)
        if container:
            try:
                checked('OWNED_CONTAINER_LABEL', command(['docker', 'inspect', '--format', '{{index .Config.Labels "codeless.d27-existing-demo"}}', container], 'cleanup-label') == 'true')
                command(['docker', 'rm', '-f', '-v', container], 'cleanup-owned-pg')
            except Exception as e: report['cleanupErrors'].append(type(e).__name__)
        if original:
            try: checked('FINAL_D23_INPUT_UNCHANGED', original == input_hashes())
            except Exception as e: report['cleanupErrors'].append(type(e).__name__)
        if report['cleanupErrors']: report['status'] = 'FAILED'
        report['finishedAt'] = datetime.now(timezone.utc).isoformat()
        report['harnessSha256'] = release.sha(Path(__file__).read_bytes())
        if (output / 'api.log').exists(): report['apiLogSha256'] = release.sha((output / 'api.log').read_bytes())
        report['command'] = ['python', '-B', 'tests/release/api/existing_demo.py', '--backup', '<private canonical D23 backup>', '--source-evidence', report['sourceEvidence']]
        report['exitCode'] = 0 if report['status'] == 'PASSED' else 1
        (public / 'result.json').write_bytes(release.canonical(report))
        print(json.dumps({'status': report['status'], 'exitCode': report['exitCode'], 'checks': len(report['checks']),
                          'errorCode': report.get('errorCode'), 'evidence': public.relative_to(ROOT).as_posix()}))
    return report['exitCode']


if __name__ == '__main__': sys.exit(main())
