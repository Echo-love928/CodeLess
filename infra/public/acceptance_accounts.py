"""Ephemeral, explicitly tagged accounts for same-host acceptance only. No secret files or stdout."""
import http.cookiejar
import json
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ORIGIN = 'https://app.codeless-platform.top'

class AcceptanceAccounts:
    def __init__(self, run_id):
        if not re.fullmatch(r'[a-z0-9-]{1,80}', run_id):
            raise ValueError('Invalid acceptance run ID')
        self.run_id = run_id
        self.users = []
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, method, path, data=None):
        headers = {'Accept': 'application/json'}
        if method != 'GET':
            headers['X-CSRF-Token'] = self.token
            headers['Content-Type'] = 'application/json'
        body = None if data is None else json.dumps(data).encode()
        with self.opener.open(urllib.request.Request(ORIGIN + '/api/v0/' + path, data=body, method=method, headers=headers), timeout=40) as response:
            result = response.read()
            return json.loads(result) if result else None

    def __enter__(self):
        self.token = self.call('GET', 'auth/csrf')['token']
        secret = None
        model_provider = 'deterministic-mock'
        for line in Path('/etc/codeless/api.env').read_text().splitlines():
            if line.startswith('CODELESS_MODEL_PROVIDER='):
                model_provider = shlex.split(line.split('=', 1)[1])[0]
            if line.startswith('CODELESS_ADMIN_PASSWORD='):
                secret = shlex.split(line.split('=', 1)[1])[0]
        if not secret:
            raise RuntimeError('Operator admin credential missing')
        self.call('POST', 'auth/login', {'email': 'admin@codeless.local', 'password': secret})
        secret = None
        result = {'modelProvider': model_provider}
        try:
            for label in ('owner', 'foreign'):
                email = f'acceptance-{label}+{self.run_id}@codeless.local'
                password = secrets.token_urlsafe(24)
                user = self.call('POST', 'admin/users', {'email': email, 'displayName': '独立验收账号 ' + label,
                    'password': password, 'role': 'USER', 'isTest': True})
                self.users.append(user['id'])
                result['email' if label == 'owner' else 'foreignEmail'] = email
                result['password' if label == 'owner' else 'foreignPassword'] = password
            # Explicit synthetic negative fixture, private to this run. It never enters demo or production metrics.
            app, version = str(uuid.uuid4()), str(uuid.uuid4())
            owner = str(uuid.UUID(self.users[0]))
            query = ("BEGIN; INSERT INTO applications(id,owner_id,name,template,data_mode,is_test) VALUES ('" + app + "','" + owner +
                "','独立验收失败版本夹具','VUE','STATIC',true); INSERT INTO application_versions(id,application_id,number,source_digest,status) VALUES ('" + version + "','" + app +
                "',1,'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','FAILED'); COMMIT;")
            subprocess.run(['docker', 'exec', '-i', 'codeless-public-postgres-1', 'psql', '-X', '-U', 'codeless', '-d', 'codeless', '-v', 'ON_ERROR_STOP=1'],
                input=query, text=True, capture_output=True, check=True, timeout=10)
            result['failedVersionApplicationId'] = app
            result['failedVersionFixtureSource'] = 'explicit per-run synthetic FAILED version'
            return result
        except Exception:
            self.cleanup()
            raise

    def cleanup(self):
        failed = False
        for user_id in self.users:
            for attempt in range(4):
                try:
                    self.call('POST', 'admin/users/' + str(uuid.UUID(user_id)) + '/cleanup', {})
                    break
                except urllib.error.HTTPError as error:
                    if error.code == 409 and attempt < 3:
                        time.sleep(3)
                        continue
                    failed = True
                    break
                except Exception:
                    failed = True
                    break
        if failed:
            raise RuntimeError('Acceptance cleanup incomplete; tagged accounts require operator retry')

    def __exit__(self, exc_type, exc_value, traceback):
        self.cleanup()
        return False
