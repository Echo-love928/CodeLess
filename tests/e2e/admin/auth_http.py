"""Real Spring/PG role-boundary probe, never a D17-A management-data fixture.

Run after Maven has compiled the current tree and emitted a Surefire classpath.
Uses a separate ephemeral database; never connects to the full suite's database.
"""
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[3]
output = root / '.local-data/d17-b' / (time.strftime('%Y-%m-%dT%H-%M-%S', time.gmtime()) + '-auth-http')
output.mkdir(parents=True)
report = {'status': 'RUNNING', 'checks': [], 'transport': 'real HTTP + Spring + isolated PostgreSQL', 'modelCalls': 0}
container = None
app = None
image = 'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'


def command(*args):
    return subprocess.check_output(args, cwd=root, text=True, stderr=subprocess.STDOUT, timeout=60).strip()


def client():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def request(browser, path, body=None, token=None):
    headers = {'Accept': 'application/json'}
    if token:
        headers['X-CSRF-Token'] = token
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        response = browser.open(req, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.loads(response.read())


def expect(browser, path, expected, body=None, token=None):
    actual, payload = request(browser, path, body, token)
    report['checks'].append({'method': 'POST' if body is not None else 'GET', 'path': path, 'expected': expected, 'actual': actual, 'code': payload.get('code')})
    assert actual == expected, (path, expected, actual)
    return payload


try:
    report['head'] = command('git', 'rev-parse', 'HEAD')
    classpath_report = root / 'services/api/target/surefire-reports/TEST-dev.codeless.api.admin.AdminIntegrationTest.xml'
    properties = ET.parse(classpath_report).find('properties')
    classpath = next(p.attrib['value'] for p in properties if p.attrib['name'] == 'surefire.test.class.path')
    # Exclude test classes/resources, probes and configuration from the server.
    classpath = os.pathsep.join(p for p in classpath.split(os.pathsep) if Path(p).name != 'test-classes')
    main_classes = root / 'services/api/target/classes'
    report['compiledClassDigests'] = {p.relative_to(main_classes).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in main_classes.rglob('*.class')}
    name = 'codeless-d17-admin-auth-' + uuid.uuid4().hex[:12]
    container = command('docker', 'run', '-d', '--name', name, '--label', 'codeless.test=d17-admin-auth', '-p', '127.0.0.1::5432',
                        '-e', 'POSTGRES_USER=d17_test', '-e', 'POSTGRES_PASSWORD=fixture-only-d17', '-e', 'POSTGRES_DB=d17_test', image)
    report['containerId'] = container
    port = json.loads(command('docker', 'inspect', container))[0]['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort']
    with socket.socket() as reserved:
        reserved.bind(('127.0.0.1', 0))
        app_port = reserved.getsockname()[1]
    base = f'http://127.0.0.1:{app_port}/api/v0'
    environment = {k: v for k, v in os.environ.items() if not k.startswith('CODELESS_')}
    environment.update(CODELESS_DATABASE_URL=f'jdbc:postgresql://127.0.0.1:{port}/d17_test', CODELESS_DATABASE_USER='d17_test',
                       CODELESS_DATABASE_PASSWORD='fixture-only-d17', CODELESS_COOKIE_SECURE='false', CODELESS_MODEL_PROVIDER='deterministic-mock',
                       CODELESS_DEMO_PASSWORD='fixture-demo-only-d17', CODELESS_ADMIN_PASSWORD='fixture-admin-only-d17')
    java = str(Path(os.environ['JAVA_HOME']) / 'bin/java.exe') if os.name == 'nt' else str(Path(os.environ['JAVA_HOME']) / 'bin/java')
    with (output / 'server.log').open('wb') as log:
        app = subprocess.Popen([java, '-cp', classpath, 'dev.codeless.api.CodeLessApiApplication', '--server.address=127.0.0.1',
                                f'--server.port={app_port}', '--codeless.tasks.enabled=false', '--codeless.agent.enabled=false',
                                '--codeless.deploy.worker-enabled=false'], cwd=root, env=environment, stdout=log, stderr=log)
        deadline = time.monotonic() + 90
        while True:
            if app.poll() is not None:
                raise RuntimeError('Spring server exited; inspect server.log')
            try:
                if request(client(), '/auth/csrf')[0] == 200:
                    break
            except (OSError, urllib.error.URLError):
                pass
            if time.monotonic() >= deadline:
                raise TimeoutError('Spring server readiness deadline; inspect server.log')
            time.sleep(0.5)
        anonymous = client()
        expect(anonymous, '/admin/session', 401)
        expect(anonymous, '/admin/tasks', 401)
        user = client()
        csrf = expect(user, '/auth/csrf', 200)['token']
        expect(user, '/auth/login', 200, {'email': 'demo@codeless.local', 'password': 'fixture-demo-only-d17'}, csrf)
        csrf = expect(user, '/auth/csrf', 200)['token']
        for path in ['/admin/session', '/admin/tasks', '/admin/applications', '/admin/deployments', '/admin/users', '/admin/model-calls', '/admin/metrics']:
            expect(user, path, 403)
        expect(user, '/admin/tasks/11111111-1111-4111-8111-111111111111/cancel', 403, {'reason': 'fixture boundary test'}, csrf)
        admin = client()
        csrf = expect(admin, '/auth/csrf', 200)['token']
        expect(admin, '/auth/login', 200, {'email': 'admin@codeless.local', 'password': 'fixture-admin-only-d17'}, csrf)
        assert expect(admin, '/admin/session', 200)['role'] == 'ADMIN'
        assert expect(admin, '/admin/tasks', 200)['totalItems'] == 0
        report['status'] = 'PASSED'
except BaseException as error:
    report.update(status='FAILED', error=repr(error))
    raise
finally:
    cleanup = {}
    if app is not None:
        if app.poll() is None:
            app.terminate()
            try:
                app.wait(timeout=10)
            except subprocess.TimeoutExpired:
                app.kill()
                app.wait(timeout=10)
        cleanup['serverExitCode'] = app.returncode
    if container:
        try:
            info = json.loads(command('docker', 'inspect', container))[0]
            assert info['Id'] == container and info['Config']['Labels']['codeless.test'] == 'd17-admin-auth'
            command('docker', 'rm', '-f', container)
            cleanup['containerRemoved'] = True
        except BaseException as error:
            cleanup.update(containerRemoved=False, error=repr(error))
            report['status'] = 'FAILED'
    report['cleanup'] = cleanup
    (output / 'result.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'directory': str(output), 'status': report['status'], 'checks': len(report['checks']), 'cleanup': cleanup}))
    if report['status'] != 'PASSED':
        raise SystemExit(1)
