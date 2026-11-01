"""D27 real package startup, V4 demo-fixture dump/restore -> V5, read/failure checks.

No existing database is read or mutated. Historical VERIFIED/build rows are explicit
compatibility fixtures, never evidence of historical builds or real model quality.
"""
import argparse
import http.cookiejar
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
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

PG = 'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', required=True)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    package = Path(args.package).absolute()
    manifest = release.verify(package, args.manifest_sha256)
    output = Path(args.output).absolute()
    release.require(output.is_relative_to(ROOT / 'tests/release/api/.private') and not output.exists(), 'FRESH_PRIVATE_OUTPUT_REQUIRED')
    output.mkdir(parents=True)
    report = {'task': 'D27-A', 'status': 'RUNNING', 'sourceCommit': manifest['sourceCommit'],
              'apiManifestSha256': args.manifest_sha256, 'apiJarSha256': release.sha((package / 'api.jar').read_bytes()),
              'databaseImage': PG, 'modelProvider': 'deterministic-mock', 'paidModelRequests': 0,
              'history': 'explicit synthetic V4 demo fixture; not an operator demo backup or historical build proof',
              'actualDemoBackup': 'NOT_PROVIDED', 'publicAcceptance': False,
              'checks': [], 'commands': [], 'cleanupErrors': []}
    containers, api = [], None
    password, admin = secrets.token_urlsafe(28), secrets.token_urlsafe(28)
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(('CODELESS_', 'SPRING_', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS'))}
    env.update(CODELESS_MODEL_PROVIDER='deterministic-mock', CODELESS_COOKIE_SECURE='false',
               CODELESS_DATABASE_USER='d27_fixture', CODELESS_DATABASE_PASSWORD=secrets.token_urlsafe(24),
               CODELESS_MODEL_AUDIT_ROOT=str(output / 'runtime/modelAudit'), CODELESS_FILE_AUDIT_ROOT=str(output / 'runtime/fileAudit'),
               CODELESS_FILE_WORKSPACE_ROOT=str(output / 'runtime/workspaces'))
    java = str(Path(env['JAVA_HOME']) / 'bin' / ('java.exe' if os.name == 'nt' else 'java'))
    runtime = output / 'runtime'
    roots = {n: runtime / n for n in ('agent', 'workspaces', 'modelAudit', 'fileAudit', 'hosting', 'release')}
    for path in roots.values(): path.mkdir(parents=True, exist_ok=True)
    shutil.copytree(package, roots['release'] / 'api')
    version = str(uuid.uuid4()); unknown = str(uuid.uuid4()); ambiguous = str(uuid.uuid4())
    app, task, task2, build, publication = [str(uuid.uuid4()) for _ in range(5)]
    content = b'<template><main>D27 historical source fixture</main></template>\n'
    source_files = [{'path': 'src/pages/HomePage.vue', 'bytes': len(content), 'digest': 'sha256:' + release.sha(content)}]
    source_digest = 'sha256:' + release.sha(json.dumps(source_files, separators=(',', ':')).encode())
    source = roots['agent'] / 'versions' / version
    (source / 'source/src/pages').mkdir(parents=True)
    source_file = source / 'source/src/pages/HomePage.vue'
    source_file.write_bytes(content)
    (source / 'source-manifest.json').write_text(json.dumps({'digest': source_digest, 'files': source_files}), encoding='utf-8')
    schema_root = package / 'repository/services/api/src/main/resources/db/migration'
    report['migrationFiles'] = {p.name: release.sha(p.read_bytes()) for p in sorted(schema_root.glob('V*.sql'))}
    def checked(name, ok):
        release.require(ok, name)
        report['checks'].append(name)
    def command(argv, label, data=None):
        r = subprocess.run(argv, input=data, capture_output=True, timeout=180)
        # Never export container args (fixture credentials) or SQL/JVM logs.
        report['commands'].append({'operation': label, 'exitCode': r.returncode,
                                   'stdoutSha256': release.sha(r.stdout), 'stderrSha256': release.sha(r.stderr)})
        if r.returncode != 0:
            # Private diagnostics only; never export SQL/credentials with receipts.
            (output / ('command-' + str(len(report['commands'])) + '-' + label + '.stderr')).write_bytes(r.stderr)
        release.require(r.returncode == 0, 'COMMAND_FAILED_' + label)
        return r.stdout.decode().strip()
    def docker(*argv, label='docker'):
        return command(['docker', *argv], label)
    def sql(container, text):
        return command(['docker', 'exec', '-i', container, 'psql', '-U', 'd27_fixture', '-d', 'd27_fixture',
                        '-X', '-At', '-v', 'ON_ERROR_STOP=1'], 'psql', text.encode())
    def db():
        name = 'codeless-d27-api-' + str(uuid.uuid4())
        docker('run', '-d', '--name', name, '--label', 'codeless.d27-api=true', '--memory', '384m',
               '--cpus', '0.5', '--pids-limit', '128', '-p', '127.0.0.1::5432',
               '-e', 'POSTGRES_USER=d27_fixture', '-e', 'POSTGRES_DB=d27_fixture',
               '-e', 'POSTGRES_PASSWORD=' + env['CODELESS_DATABASE_PASSWORD'], PG, label='create-owned-pg')
        containers.append(name)
        deadline = time.monotonic() + 60
        while True:
            # The image's bootstrap server accepts Unix sockets before the
            # requested database exists. JDBC requires the final TCP server.
            r = subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'd27_fixture', '-d', 'd27_fixture'], capture_output=True, timeout=5)
            if r.returncode == 0: break
            release.require(time.monotonic() < deadline, 'PG_NOT_READY'); time.sleep(.2)
        binding = json.loads(docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', name))
        return name, binding['5432/tcp'][0]['HostPort']
    def dispose(name):
        checked('OWNED_PG_LABEL', docker('inspect', '--format', '{{index .Config.Labels "codeless.d27-api"}}', name) == 'true')
        docker('rm', '-f', '-v', name, label='remove-owned-pg'); containers.remove(name)
    def stop():
        nonlocal api
        if api is None: return
        if api.poll() is None:
            api.terminate()
            try: api.wait(timeout=20)
            except subprocess.TimeoutExpired: api.kill(); api.wait(timeout=10)
        api = None
    def client():
        return urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def request(browser, base, path, method='GET', body=None, token=None):
        data = None if body is None else json.dumps(body).encode()
        headers = {'Content-Type': 'application/json'}
        if token: headers['X-CSRF-Token'] = token
        req = urllib.request.Request(base + '/api/v0/' + path, data=data, method=method, headers=headers)
        try: r = browser.open(req, timeout=3)
        except urllib.error.HTTPError as e: r = e
        with r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    def start(database, label, target=None, seeds=False, expect_failure=False):
        nonlocal api
        stop()
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
        base = 'http://127.0.0.1:' + str(port)
        launch_env = dict(env, CODELESS_DATABASE_URL='jdbc:postgresql://127.0.0.1:' + database[1] + '/d27_fixture')
        if seeds: launch_env.update(CODELESS_DEMO_PASSWORD=password, CODELESS_ADMIN_PASSWORD=admin)
        params = ['--server.address=127.0.0.1', '--server.port=' + str(port),
                  '--codeless.tasks.enabled=false', '--codeless.agent.enabled=false', '--codeless.deploy.worker-enabled=false',
                  '--codeless.recovery.sweep-enabled=false', '--codeless.cover.enabled=false',
                  '--codeless.agent.private-root=' + str(roots['agent']),
                  '--codeless.export.repository-root=' + str(roots['release'] / 'api/repository')]
        if target: params.append('--spring.flyway.target=' + target)
        # All starts, including migration, use the copied/sealed jar and production main.
        jar = roots['release'] / 'api/api.jar'
        checked('SAME_SEALED_JAR', release.sha(jar.read_bytes()) == report['apiJarSha256'])
        with (output / (label + '.log')).open('xb') as log:
            api = subprocess.Popen([java, '-Xms64m', '-Xmx384m', '-jar', str(jar), *params], cwd=output, env=launch_env,
                                   stdout=log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 75
        while time.monotonic() < deadline:
            if api.poll() is not None:
                code = api.returncode
                report['commands'].append({'operation': label, 'exitCode': code,
                                           'logSha256': release.sha((output / (label + '.log')).read_bytes())})
                checked('EXPECTED_MIGRATION_STARTUP_FAILURE', expect_failure and code != 0)
                if expect_failure:
                    raw = (output / (label + '.log')).read_bytes()
                    checked('FLYWAY_CHECKSUM_MISMATCH_REPORTED', b'Migration checksum mismatch' in raw and b'Validate failed' in raw)
                return None
            try:
                if request(client(), base, 'auth/csrf')[0] == 200:
                    checked('API_READY_' + label, not expect_failure)
                    return base
            except (OSError, urllib.error.URLError): pass
            time.sleep(.2)
        raise ValueError('API_STARTUP_TIMEOUT_' + label)
    def rows(container):
        return {t: sql(container, f'SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),\'[]\'::jsonb) FROM {t} t;')
                for t in ('applications', 'builds', 'publications', 'generation_tasks')}
    class StoppedOwnedWriters:
        def check(self):
            release.require(api is None or api.poll() is not None, 'FIXTURE_API_MUST_BE_STOPPED')
    try:
        docker('info', '--format', '{{.ServerVersion}}', label='docker-preflight')
        source_db = db()
        checked('T1_EMPTY_DATABASE', sql(source_db[0], "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';") == '0')
        base = start(source_db, 'empty-V5')
        checked('T1_FLYWAY_V1_V5', sql(source_db[0], 'SELECT string_agg(version,\',\' ORDER BY installed_rank) FROM flyway_schema_history WHERE success;') == '1,2,3,4,5')
        checked('NO_DEFAULT_ACCOUNTS', sql(source_db[0], 'SELECT count(*) FROM platform_users;') == '0')
        checked('T1_ANONYMOUS_401', request(client(), base, 'versions/' + version)[0] == 401)
        stop(); dispose(source_db[0])
        legacy = db()
        checked('T2_EMPTY_LEGACY_DATABASE', sql(legacy[0], "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';") == '0')
        start(legacy, 'legacy-target-V4', target='4', seeds=True)
        # Tomcat/CSRF can be live before ApplicationRunner finishes its two
        # BCrypt seed transactions. Wait for the real fixture rows before stop.
        deadline = time.monotonic() + 30
        while sql(legacy[0], "SELECT count(*) FROM platform_users u JOIN auth_credentials c ON c.user_id=u.id WHERE u.email IN ('demo@codeless.local','admin@codeless.local');") != '2':
            release.require(api.poll() is None and time.monotonic() < deadline, 'FIXTURE_ACCOUNT_SEED_TIMEOUT')
            time.sleep(.1)
        checked('T2_BOTH_FIXTURE_ACCOUNTS_SEEDED', True)
        stop()
        checked('T2_BASELINE_V4', sql(legacy[0], 'SELECT max(version) FROM flyway_schema_history WHERE success;') == '4')
        owner = sql(legacy[0], "SELECT id FROM platform_users WHERE email='demo@codeless.local';")
        sql(legacy[0], f"""
INSERT INTO applications(id,owner_id,name,template,data_mode,status) VALUES ('{app}','{owner}','D27 synthetic historical demo','VUE','MOCK','ACTIVE');
INSERT INTO generation_tasks(id,application_id,prompt,status) VALUES ('{task}','{app}','Explicit historical fixture','PLAN'),('{task2}','{app}','Explicit ambiguous fixture','PLAN');
INSERT INTO application_versions(id,application_id,number,source_digest,status) VALUES
 ('{version}','{app}',1,'{source_digest}','DRAFT'),('{unknown}','{app}',2,'sha256:'||repeat('c',64),'DRAFT'),('{ambiguous}','{app}',3,'sha256:'||repeat('d',64),'DRAFT');
INSERT INTO builds(id,task_id,version_id,status,exit_code,artifact_digest,completed_at) VALUES
 ('{build}','{task}','{version}','SUCCEEDED',0,'sha256:'||repeat('b',64),now());
INSERT INTO builds(id,task_id,version_id,status) VALUES ('{uuid.uuid4()}','{task}','{ambiguous}','QUEUED'),('{uuid.uuid4()}','{task2}','{ambiguous}','QUEUED');
UPDATE application_versions SET status='VERIFIED',build_id='{build}' WHERE id='{version}';
UPDATE applications SET latest_ready_version_id='{version}' WHERE id='{app}';
INSERT INTO publications(id,application_id,version_id,requested_by,status,url,published_at) VALUES
 ('{publication}','{app}','{version}','{owner}','PUBLISHED','https://fixture.example.test/d27',now());
""")
        before = rows(legacy[0])
        old_versions = sql(legacy[0], 'SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM application_versions v;')
        spec = importlib.util.spec_from_file_location('d27_backup', ROOT / 'scripts/backup/backup.py')
        backup = importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)
        source_config = {'container': legacy[0], 'database': 'd27_fixture', 'user': 'd27_fixture'}
        saved = backup.backup({'database': source_config, 'roots': roots, 'reserveBytes': 64 * 1024 * 1024}, output / 'backup', StoppedOwnedWriters())
        binding = release.verify_backup(output / 'backup', args.manifest_sha256)
        checked('T2_BACKUP_CANDIDATE_BOUND', binding['sourceCommit'] == manifest['sourceCommit'] and binding['backupId'] == saved['backupId'])
        report['backupBinding'] = binding
        dispose(legacy[0])
        target_db = db()
        restored = backup.restore({'container': target_db[0], 'database': 'd27_fixture', 'user': 'd27_fixture'},
                                  output / 'backup', output / 'restored', 64 * 1024 * 1024, StoppedOwnedWriters())
        checked('T2_INDEPENDENT_EMPTY_CLUSTER_RESTORE', restored['applicationAcceptance'] == 'NOT_RUN')
        # Recreate the *original* paths only after moving every original fixture root away.
        runtime.rename(output / 'source-runtime-offline')
        shutil.copytree(output / 'restored', runtime)
        release.verify(roots['release'] / 'api', args.manifest_sha256)
        base = start(target_db, 'restored-migrate-V5')
        checked('T2_FLYWAY_V5', sql(target_db[0], 'SELECT max(version) FROM flyway_schema_history WHERE success;') == '5')
        checked('T2_EXISTING_ROWS_UNCHANGED', rows(target_db[0]) == before)
        preserved = sql(target_db[0], "SELECT jsonb_agg(to_jsonb(v)-'source_task_id' ORDER BY id) FROM application_versions v;")
        checked('T2_VERSION_ID_DIGEST_STATUS_UNCHANGED', json.loads(preserved) == json.loads(old_versions))
        checked('T2_PROVENANCE_BACKFILLED', sql(target_db[0], f"SELECT source_task_id FROM application_versions WHERE id='{version}';") == task)
        checked('T2_UNKNOWN_AND_AMBIGUOUS_STAY_NULL', sql(target_db[0], f"SELECT count(*) FROM application_versions WHERE id IN ('{unknown}','{ambiguous}') AND source_task_id IS NULL;") == '2')
        browser = client()
        code, csrf = request(browser, base, 'auth/csrf'); checked('T2_CSRF', code == 200)
        checked('T2_OWNER_LOGIN', request(browser, base, 'auth/login', 'POST', {'email': 'demo@codeless.local', 'password': password}, csrf['token'])[0] == 200)
        code, page = request(browser, base, 'applications/' + app + '/versions')
        checked('T2_OWNER_VERSION_LIST', code == 200 and page['latestReadyVersionId'] == version and page['total'] == 3)
        code, detail = request(browser, base, 'versions/' + version)
        checked('T2_OWNER_VERSION_DETAIL', code == 200 and detail['sourceDigest'] == source_digest and detail['taskId'] == task and detail['status'] == 'VERIFIED')
        code, file = request(browser, base, 'versions/' + version + '/files/content?path=src/pages/HomePage.vue')
        checked('T2_SOURCE_HTTP_BYTES', code == 200 and file['content'].encode() == content and file['digest'] == 'sha256:' + release.sha(content))
        code, pub = request(browser, base, 'publications/' + publication)
        checked('T2_HISTORICAL_PUBLICATION_READ', code == 200 and pub['versionId'] == version and pub['status'] == 'PUBLISHED')
        checked('T2_ANONYMOUS_401', request(client(), base, 'versions/' + version)[0] == 401)
        other = client(); _, token = request(other, base, 'auth/csrf')
        checked('T2_OTHER_ACCOUNT_LOGIN', request(other, base, 'auth/login', 'POST', {'email': 'admin@codeless.local', 'password': admin}, token['token'])[0] == 200)
        checked('T2_OTHER_OWNER_404', request(other, base, 'versions/' + version)[0] == 404)
        source_file.write_bytes(content + b'changed')
        checked('T2_CORRUPTED_SOURCE_503', request(browser, base, 'versions/' + version + '/files')[0] == 503)
        source_file.write_bytes(content)
        stop(); start(target_db, 'restart-V5')
        checked('T2_RESTART_NO_NEW_MIGRATION', sql(target_db[0], 'SELECT count(*) FROM flyway_schema_history;') == '5')
        stop()
        sql(target_db[0], "UPDATE flyway_schema_history SET checksum=checksum+1 WHERE version='5';")
        start(target_db, 'bad-checksum', expect_failure=True)
        checked('T2_MIGRATION_FAILURE_PRESERVES_ROWS', rows(target_db[0]) == before)
        report.update(status='PASSED', T1='PASSED', T2='SYNTHETIC_DEMO_PASSED_ACTUAL_DEMO_BLOCKED')
    except Exception as e:
        report.update(status='FAILED', errorCode=str(e) if isinstance(e, ValueError) else type(e).__name__)
    finally:
        try: stop()
        except Exception as e: report['cleanupErrors'].append(type(e).__name__)
        for name in containers[:]:
            try: dispose(name)
            except Exception as e: report['cleanupErrors'].append(type(e).__name__)
        if report['cleanupErrors']: report['status'] = 'FAILED'
        report['logDigests'] = {p.name: release.sha(p.read_bytes()) for p in output.glob('*.log')}
        (output / 'result.json').write_bytes(release.canonical(report))
        print(json.dumps({'status': report['status'], 'checks': len(report['checks']), 'errorCode': report.get('errorCode'),
                          'privateReport': str(output / 'result.json')}))
    return 0 if report['status'] == 'PASSED' else 1


if __name__ == '__main__': sys.exit(main())
