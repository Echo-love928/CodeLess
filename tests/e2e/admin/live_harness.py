"""Dedicated PG + current compiled Spring + production Vite preview + real Chromium.
Database seed records are explicit test data; no HTTP request is mocked.
"""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.request
import uuid
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[3]
output = root / '.local-data/d17-b/integration/live' / time.strftime('%Y-%m-%dT%H-%M-%SZ', time.gmtime())
output.mkdir(parents=True)
report = {'status': 'RUNNING', 'transport': 'real Chromium HTTP / Spring / dedicated PostgreSQL', 'modelCalls': 0}
database = None
processes = []
logs = []


def run(*args):
    return subprocess.check_output(args, cwd=root, text=True, stderr=subprocess.STDOUT, timeout=60).strip()


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def start(args, log_name, env):
    log = (output / log_name).open('wb')
    logs.append(log)
    child = subprocess.Popen(args, cwd=root, env=env, stdout=log, stderr=log)
    processes.append(child)
    return child


def ready(url, child):
    end = time.monotonic() + 60
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < end:
        if child.poll() is not None:
            raise RuntimeError('Owned test service exited; inspect logs')
        try:
            with client.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(.25)
    raise TimeoutError('Owned test service readiness deadline')


try:
    report['head'] = run('git', 'rev-parse', 'HEAD')
    classpath_file = root / 'services/api/target/surefire-reports/TEST-dev.codeless.api.admin.AdminIntegrationTest.xml'
    properties = ET.parse(classpath_file).find('properties')
    classpath = next(p.attrib['value'] for p in properties if p.attrib['name'] == 'surefire.test.class.path')
    classpath = os.pathsep.join(p for p in classpath.split(os.pathsep) if Path(p).name != 'test-classes')
    classes = root / 'services/api/target/classes'
    report['compiledClasses'] = {p.relative_to(classes).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in classes.rglob('*.class')}
    seed = root / 'tests/e2e/admin/seed-live.sql'
    report['seedDigest'] = hashlib.sha256(seed.read_bytes()).hexdigest()
    database = run('docker', 'run', '-d', '--name', 'codeless-d17-integration-' + uuid.uuid4().hex[:12], '--label', 'codeless.test=d17-live',
                   '-p', '127.0.0.1::5432', '-e', 'POSTGRES_USER=d17_test', '-e', 'POSTGRES_PASSWORD=fixture-only-d17', '-e', 'POSTGRES_DB=d17_test',
                   'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94')
    info = json.loads(run('docker', 'inspect', database))[0]
    db_port = info['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort']
    api_port, web_port = port(), port()
    environment = {k: v for k, v in os.environ.items() if not k.startswith('CODELESS_')}
    environment.update(CODELESS_DATABASE_URL=f'jdbc:postgresql://127.0.0.1:{db_port}/d17_test', CODELESS_DATABASE_USER='d17_test',
                       CODELESS_DATABASE_PASSWORD='fixture-only-d17', CODELESS_COOKIE_SECURE='false', CODELESS_MODEL_PROVIDER='deterministic-mock',
                       CODELESS_DEMO_PASSWORD='fixture-demo-only-d17', CODELESS_ADMIN_PASSWORD='fixture-admin-only-d17',
                       CODELESS_ADMIN_AUDIT_ROOT=str(output / 'audit'), CODELESS_ADMIN_LIVE_API_ORIGIN=f'http://127.0.0.1:{api_port}',
                       CODELESS_ADMIN_LIVE_WEB_ORIGIN=f'http://127.0.0.1:{web_port}', CODELESS_ADMIN_LIVE_OUTPUT=str(output))
    java = str(Path(os.environ['JAVA_HOME']) / 'bin' / ('java.exe' if os.name == 'nt' else 'java'))
    api = start([java, '-cp', classpath, 'dev.codeless.api.CodeLessApiApplication', '--server.address=127.0.0.1', f'--server.port={api_port}',
                 '--codeless.tasks.enabled=false', '--codeless.agent.enabled=false', '--codeless.deploy.worker-enabled=false'], 'api.log', environment)
    ready(environment['CODELESS_ADMIN_LIVE_API_ORIGIN'] + '/api/v0/auth/csrf', api)
    subprocess.run(['docker', 'exec', '-i', database, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'd17_test', '-d', 'd17_test'],
                   cwd=root, input=seed.read_text(encoding='utf-8'), text=True, encoding='utf-8', check=True, timeout=30, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    node = run('node', '-p', 'process.execPath')
    web = start([node, 'apps/web/node_modules/vite/bin/vite.js', 'preview', '--config', 'tests/e2e/admin/vite.live.config.mjs',
                 '--host', '127.0.0.1', '--port', str(web_port), '--strictPort'], 'web.log', environment)
    ready(environment['CODELESS_ADMIN_LIVE_WEB_ORIGIN'] + '/login', web)
    command = [os.environ.get('ComSpec', 'cmd.exe'), '/d', '/c', 'corepack', 'pnpm', 'exec', 'playwright', 'test', '--config', 'tests/e2e/admin/playwright.live.config.ts'] if os.name == 'nt' else ['corepack', 'pnpm', 'exec', 'playwright', 'test', '--config', 'tests/e2e/admin/playwright.live.config.ts']
    browser = start(command, 'browser.log', environment)
    report['browserCommand'] = command
    report['browserExitCode'] = browser.wait(timeout=150)
    if report['browserExitCode'] != 0:
        raise RuntimeError('Real browser acceptance failed; inspect browser.log')
    state = run('docker', 'exec', database, 'psql', '-U', 'd17_test', '-d', 'd17_test', '-At', '-c',
                "SELECT json_build_object('status',status,'failureCode',failure_code,'queueState',queue_state,'leaseCleared',lease_token IS NULL,'eventCount',(SELECT count(*) FROM task_events e WHERE e.task_id=t.id)) FROM generation_tasks t WHERE id='11111111-1111-4111-8111-000000000025';")
    report['cancelledSqlState'] = json.loads(state)
    assert report['cancelledSqlState'] == {'status': 'FAILED', 'failureCode': 'CANCELLED', 'queueState': 'FINISHED', 'leaseCleared': True, 'eventCount': 1}
    report['auditFiles'] = {p.name: json.loads(p.read_text(encoding='utf-8')) for p in (output / 'audit').glob('*.json')}
    assert len(report['auditFiles']) == 4  # Original + explicit ALREADY_TERMINAL, each intent + completion.
    assert 'sk-live-fixture-secret-for-audit' not in json.dumps(report['auditFiles'])
    report['status'] = 'PASSED'
except BaseException as error:
    report.update(status='FAILED', error=repr(error))
finally:
    for child in reversed(processes):
        if child.poll() is None:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
            else:
                child.terminate()
            child.wait(timeout=15)
    for log in logs:
        log.close()
    if database:
        try:
            info = json.loads(run('docker', 'inspect', database))[0]
            assert info['Id'] == database and info['Config']['Labels']['codeless.test'] == 'd17-live'
            run('docker', 'rm', '-f', database)
            report['databaseRemoved'] = True
        except BaseException as error:
            report.update(status='FAILED', cleanupError=repr(error))
    (output / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(output), 'status': report['status'], 'browserExitCode': report.get('browserExitCode'), 'error': report.get('error')}))
    raise SystemExit(0 if report['status'] == 'PASSED' else 1)
