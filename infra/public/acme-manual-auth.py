#!/usr/bin/env python3
"""Collect operator DNS-01 records, then await all authoritative TXT answers.

One-time issuance helper; it does not write DNS or provide automatic renewal.
State directory must be a fresh root-owned directory for each Certbot attempt.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time

ZONES = {
    'app.codeless-platform.top': 'codeless-platform.top',
    'preview.codeless-preview.top': 'codeless-preview.top',
    'sites.codeless-publish.top': 'codeless-publish.top',
}


def challenge_record(domain, value):
    domain = domain.removeprefix('*.')
    if domain not in ZONES or not re.fullmatch(r'[A-Za-z0-9_-]{43}', value):
        raise ValueError('Unexpected ACME identifier or validation value')
    zone = ZONES[domain]
    name = '_acme-challenge.' + domain
    return {'zone': zone, 'host': name[:-(len(zone) + 1)],
            'name': name, 'type': 'TXT', 'value': value}


def query(name, kind, authority=None):
    args = ['dig', '+short', '+time=3', '+tries=1', name, kind]
    if authority:
        args.append('@' + authority)
    result = subprocess.run(args, capture_output=True, text=True, timeout=8)
    if result.returncode:
        return []
    return [line.strip() for line in result.stdout.splitlines()
            if line.strip() and not line.startswith(';')]


def txt_values(lines):
    # ACME SHA-256 values fit one DNS character-string. Never accept a substring.
    return {line[1:-1] for line in lines
            if re.fullmatch(r'"[A-Za-z0-9_-]{43}"', line)}


def authoritative_ready(records):
    for zone in {record['zone'] for record in records}:
        authorities = query(zone, 'NS')
        if not authorities:
            return False
        for authority in authorities:
            if not re.fullmatch(r'[A-Za-z0-9.-]+\.', authority):
                return False
            for name in {record['name'] for record in records if record['zone'] == zone}:
                expected = {record['value'] for record in records if record['name'] == name}
                if not expected.issubset(txt_values(query(name, 'TXT', authority))):
                    return False
    return True


def save(path, records, status):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8') as output:
        json.dump({'status': status, 'records': records}, output, indent=2)
        output.write('\n')
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state-directory', required=True)
    args = parser.parse_args()
    directory = Path(args.state_directory)
    if (not directory.is_absolute() or directory.is_symlink()
            or directory.resolve().parent != Path('/var/lib/codeless/acme')
            or not directory.is_dir() or directory.stat().st_uid != 0
            or directory.stat().st_mode & 0o077):
        raise ValueError('Fresh private root-owned ACME directory required')
    os.umask(0o077)
    path = directory / 'pending.json'
    domain = os.environ.get('CERTBOT_IDENTIFIER', os.environ.get('CERTBOT_DOMAIN', ''))
    record = challenge_record(domain, os.environ.get('CERTBOT_VALIDATION', ''))
    remaining = int(os.environ['CERTBOT_REMAINING_CHALLENGES'])
    if remaining < 0 or remaining > 4:
        raise ValueError('Unexpected challenge count')
    previous = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
    if previous and previous['status'] != 'COLLECTING':
        raise ValueError('Completed or waiting attempt cannot be reused; create a fresh state directory')
    records = previous['records'] if previous else []
    if record not in records:
        records.append(record)
    save(path, records, 'COLLECTING' if remaining else 'WAITING_FOR_DNS')
    if remaining:
        return
    end = time.monotonic() + 3600
    while time.monotonic() < end:
        try:
            if authoritative_ready(records):
                save(path, records, 'DNS_SEEN_AWAITING_CA')
                return
        except subprocess.TimeoutExpired:
            pass
        time.sleep(10)
    save(path, records, 'DNS_WAIT_TIMEOUT')
    raise TimeoutError('Operator TXT records not visible on all authorities within one hour')


if __name__ == '__main__':
    main()
