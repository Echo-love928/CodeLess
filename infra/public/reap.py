#!/usr/bin/python3
"""Reap only expired, daemon-labelled jobs after a worker crash."""
import datetime
import json
import re
import subprocess

result = subprocess.run(['/usr/bin/docker', 'ps', '-aq', '--filter', 'label=codeless.worker-job'],
                        capture_output=True, text=True, check=True, timeout=5)
for identifier in result.stdout.split():
    if not re.fullmatch(r'[a-f0-9]{12,64}', identifier):
        raise ValueError('Invalid owned container identifier')
    item = json.loads(subprocess.run(['/usr/bin/docker', 'inspect', identifier], capture_output=True,
                                    text=True, check=True, timeout=5).stdout)[0]
    job = item['Config']['Labels'].get('codeless.worker-job', '')
    created = datetime.datetime.fromisoformat(item['Created'].replace('Z', '+00:00'))
    age = (datetime.datetime.now(datetime.timezone.utc) - created).total_seconds()
    if re.fullmatch(r'[a-f0-9]{32}', job) and age > 300:
        subprocess.run(['/usr/bin/docker', 'rm', '-f', identifier], check=True, timeout=5,
                       stdout=subprocess.DEVNULL)
        print(json.dumps({'reapedJob': job, 'containerAgeSeconds': int(age)}))
