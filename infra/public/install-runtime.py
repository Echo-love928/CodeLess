#!/usr/bin/python3
"""Root operator installer; does not start the public ingress or enable publishing."""
import grp
import json
import os
from pathlib import Path
import pwd
import secrets
import shlex
import shutil
import subprocess

BASE = Path('/srv/codeless')
REPOSITORY = BASE / 'repository'
SOURCE = REPOSITORY / 'infra/public'
OPS = Path('/opt/codeless/ops')
ETC = Path('/etc/codeless')


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def group(name):
    try:
        return grp.getgrnam(name)
    except KeyError:
        run(['groupadd', '--system', name])
        return grp.getgrnam(name)


def account(name, primary, extra=()):
    try:
        result = pwd.getpwnam(name)
    except KeyError:
        run(['useradd', '--system', '--no-create-home', '--shell', '/usr/sbin/nologin', '--gid', primary, name])
        result = pwd.getpwnam(name)
    if extra:
        run(['usermod', '-a', '-G', ','.join(extra), name])
    return result


def directory(path, owner, gid, mode):
    path.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError('Symlink deployment directory rejected')
    os.chown(path, owner, gid)
    path.chmod(mode)


def environment(path, values):
    data = ''.join(name + '=' + shlex.quote(str(value)) + '\n' for name, value in values.items())
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        output.write(data)
    path.chmod(0o600)


def main():
    if os.getuid() != 0:
        raise PermissionError('Operator root required')
    os.umask(0o077)
    shared = group('codeless-shared').gr_gid
    ipc = group('codeless-ipc').gr_gid
    ingress = grp.getgrnam('codeless-ingress').gr_gid
    api = account('codeless-api', 'codeless-shared', ('codeless-ipc',))
    worker = account('codeless-worker', 'codeless-ipc', ('codeless-shared', 'docker'))
    preview = account('codeless-preview', 'codeless-shared')
    docker = grp.getgrnam('docker').gr_gid
    for user in (api, preview):
        if docker in os.getgrouplist(user.pw_name, user.pw_gid):
            raise ValueError('Untrusted service has Docker group access')
    directory(BASE, 0, 0, 0o755)
    directory(BASE / 'private', api.pw_uid, shared, 0o2770)
    directory(BASE / 'private/agent', api.pw_uid, shared, 0o2770)
    for name in ('versions',):
        directory(BASE / 'private/agent' / name, api.pw_uid, shared, 0o2770)
    for name in ('work', 'artifacts', 'evidence', 'receipts'):
        directory(BASE / 'private/agent' / name, worker.pw_uid, shared, 0o2770)
    directory(BASE / 'publication', 0, 0, 0o755)
    directory(BASE / 'publication/sites', worker.pw_uid, shared, 0o2775)
    directory(BASE / 'publication/sites-staging', worker.pw_uid, ipc, 0o700)
    for name in ('web', 'ingress'):
        directory(BASE / name, 0, 0, 0o755)
    directory(BASE / 'worker-home', worker.pw_uid, ipc, 0o700)
    directory(OPS, 0, 0, 0o755)
    directory(OPS / 'bin', 0, 0, 0o755)
    for name in ('worker.py', 'worker-client.py', 'docker-job.py', 'reap.py', 'protect-backends.sh'):
        target = OPS / name
        if target.is_symlink():
            raise ValueError('Unexpected operator file symlink')
        target.write_bytes((SOURCE / name).read_bytes().replace(b'\r\n', b'\n'))
        target.chmod(0o755)
    docker_link = OPS / 'bin/docker'
    if not docker_link.exists():
        docker_link.symlink_to(OPS / 'docker-job.py')
    elif docker_link.resolve() != OPS / 'docker-job.py':
        raise ValueError('Unexpected worker Docker shim')
    origins = {'CODELESS_PLATFORM_ORIGIN': 'https://app.codeless-platform.top',
               'CODELESS_PREVIEW_ORIGIN': 'https://preview.codeless-preview.top',
               'CODELESS_PUBLICATION_ORIGIN': 'https://sites.codeless-publish.top'}
    (ETC / 'worker.json').write_text(json.dumps({'apiUid': api.pw_uid, **origins}))
    os.chown(ETC / 'worker.json', 0, ipc)
    (ETC / 'worker.json').chmod(0o640)
    if not (ETC / 'api.env').exists():
        config = {'server': {'address': '0.0.0.0', 'port': 8080},
                  'codeless': {'agent': {'enabled': True, 'node': str(OPS / 'worker-client.py'),
                                       'repository-root': str(REPOSITORY), 'private-root': str(BASE / 'private/agent')},
                               'tasks': {'enabled': True}, 'versions': {'root': str(BASE / 'private/agent/versions'), 'shared-readers': True}}}
        values = {'SPRING_APPLICATION_JSON': json.dumps(config, separators=(',', ':')),
                  'CODELESS_DATABASE_URL': 'jdbc:postgresql://172.29.0.2:5432/codeless', 'CODELESS_DATABASE_USER': 'codeless',
                  'CODELESS_DATABASE_PASSWORD': secrets.token_urlsafe(32),
                  'CODELESS_DEMO_PASSWORD': secrets.token_urlsafe(24), 'CODELESS_ADMIN_PASSWORD': secrets.token_urlsafe(24),
                  'CODELESS_COOKIE_SECURE': 'true', 'CODELESS_MODEL_PROVIDER': 'deterministic-mock',
                  'CODELESS_MODEL_AUDIT_ROOT': str(BASE / 'private/model-calls'),
                  'CODELESS_FILE_WORKSPACE_ROOT': str(BASE / 'private/workspaces'),
                  'CODELESS_FILE_AUDIT_ROOT': str(BASE / 'private/file-audit'),
                  'CODELESS_PREVIEW_SIGNING_KEY': secrets.token_hex(32), 'CODELESS_PREVIEW_REGISTRY_KEY': secrets.token_hex(32),
                  'CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN': 'http://127.0.0.1:8789',
                  'CODELESS_PUBLICATION_ENABLED': 'false', 'CODELESS_NODE_EXECUTABLE': str(OPS / 'worker-client.py'),
                  'CODELESS_PUBLICATION_GATEWAY_ENTRY': str(REPOSITORY / 'services/runner/src/publish/gateway-cli.mjs'),
                  'CODELESS_HOSTING_ROOT': str(BASE / 'publication/sites'), **origins}
        environment(ETC / 'api.env', values)
    values = {}
    for line in (ETC / 'api.env').read_text().splitlines():
        name, value = line.split('=', 1)
        values[name] = shlex.split(value)[0]
    environment(ETC / 'preview.env', {**origins, 'CODELESS_PREVIEW_SIGNING_KEY': values['CODELESS_PREVIEW_SIGNING_KEY'],
        'CODELESS_PREVIEW_REGISTRY_KEY': values['CODELESS_PREVIEW_REGISTRY_KEY'],
        'CODELESS_PREVIEW_API_INTERNAL_ORIGIN': 'http://127.0.0.1:8080', 'CODELESS_PREVIEW_GATEWAY_HOST': '0.0.0.0',
        'CODELESS_PREVIEW_GATEWAY_PORT': '8788', 'CODELESS_PREVIEW_CONTROL_PORT': '8789',
        'CODELESS_AGENT_PRIVATE_ROOT': str(BASE / 'private/agent'), 'CODELESS_FILE_WORKSPACE_ROOT': str(BASE / 'private/workspaces')})
    environment(ETC / 'compose.env', {'CODELESS_DATABASE_PASSWORD': values['CODELESS_DATABASE_PASSWORD'], 'CODELESS_INGRESS_GID': ingress})
    environment(ETC / 'preflight.env', {**origins, 'CODELESS_NODE_EXECUTABLE': str(OPS / 'worker-client.py'),
        'CODELESS_PUBLICATION_GATEWAY_ENTRY': values['CODELESS_PUBLICATION_GATEWAY_ENTRY'],
        'CODELESS_HOSTING_ROOT': values['CODELESS_HOSTING_ROOT'], 'CODELESS_HOSTING_CONFIG': str(BASE / 'ingress/hosting.conf'),
        'CODELESS_PLATFORM_CONFIG': str(BASE / 'web/codeless-publication-config.json'),
        'CODELESS_TLS_CERT': '/etc/codeless/tls/server.pem', 'CODELESS_TLS_KEY': '/etc/codeless/tls/server.key',
        'CODELESS_PUBLIC_BIND': '0.0.0.0:443'})
    for path in SOURCE.glob('codeless-*.service'):
        target = Path('/etc/systemd/system') / path.name
        target.write_bytes(path.read_bytes().replace(b'\r\n', b'\n'))
        target.chmod(0o644)
    for path in SOURCE.glob('codeless-*.timer'):
        target = Path('/etc/systemd/system') / path.name
        target.write_bytes(path.read_bytes().replace(b'\r\n', b'\n'))
        target.chmod(0o644)
    run(['systemctl', 'daemon-reload'])
    print(json.dumps({'installed': True, 'apiUid': api.pw_uid, 'workerUid': worker.pw_uid, 'previewUid': preview.pw_uid,
                      'ingressGid': ingress, 'apiHasDockerGroup': False, 'modelProvider': 'deterministic-mock',
                      'publicationEnabled': values['CODELESS_PUBLICATION_ENABLED'], 'servicesStarted': False}))


if __name__ == '__main__':
    main()
