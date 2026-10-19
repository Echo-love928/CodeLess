#!/usr/bin/python3
"""Trusted worker-only Docker shim: label owned containers for cancel cleanup."""
import os
import re
import sys

job = os.environ.get('CODELESS_WORKER_JOB', '')
if not re.fullmatch(r'[a-f0-9]{32}', job):
    sys.exit(2)
args = sys.argv[1:]
if args and args[0] in ('run', 'create'):
    args[1:1] = ['--label', 'codeless.worker-job=' + job]
os.execv('/usr/bin/docker', ['/usr/bin/docker', *args])
