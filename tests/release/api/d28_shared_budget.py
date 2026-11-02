"""D28 shared CNY2 admission ledger. No model, deployment, credential or reset API.

SQLite BEGIN IMMEDIATE serializes B's admissions across hosts. JSON is a read
snapshot; `status` reads/validates the authoritative database. Unknown usage never
releases a reservation. A has handed off execution and must not launch paid work.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys
import uuid

CAP = 2_000_000_000
RESERVATION = 400_000_000  # 50,000 tokens * CNY8 / million, in nano-CNY.
CANDIDATE = '00fd43333f35c5cb0cce425721fdce9cd1d0f956'
ARTIFACT = '52e49be4fca54ca6b09ca77846bfd5453ef68c84026ccd484e6017ecf216c206'
SAMPLES = {f'{p}-{i:02}' for p in ('SHOW', 'TASK', 'CAT') for i in range(1, 4)} | {
    'FAULT-CODE-01', 'FAULT-CODE-02', 'FAULT-CODE-03', 'FAULT-ENV-01', 'FAULT-ENV-02'}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def cny(n):
    whole, fraction = divmod(n, 1_000_000_000)
    return str(whole) + ('.' + f'{fraction:09}'.rstrip('0') if fraction else '')


def exposure(record):
    unknown = {'upperNanos': RESERVATION, 'usage': 'UNKNOWN', 'actualCny': None}
    if not isinstance(record, dict) or record.get('mode') != 'REAL' or 'harnessError' not in record or record['harnessError'] is not None:
        return unknown
    calls, journal = record.get('modelCalls'), record.get('journal')
    if not isinstance(calls, list) or not isinstance(journal, list):
        return unknown
    requests = sum(isinstance(e, dict) and e.get('kind') == 'model.request' for e in journal)
    if requests != len(calls) or requests > 12:
        return unknown
    integer = lambda n: type(n) is int and 0 <= n <= 2**53 - 1
    inputs = outputs = excess = 0
    for call in calls:
        if not isinstance(call, dict) or call.get('provider') != 'deepseek' or call.get('model') != 'deepseek-flash' or call.get('status') not in ('SUCCEEDED', 'FAILED'):
            return unknown
        a, b, total = call.get('inputTokens'), call.get('outputTokens'), call.get('totalTokens')
        if not integer(a) or not integer(b) or (total is not None and (not integer(total) or total < a + b)):
            return unknown
        inputs += a
        outputs += b
        excess += 0 if total is None else total - a - b
    require(inputs + outputs + excess <= 50_000, 'FINANCIAL_BOUND_BROKEN')
    return {'upperNanos': inputs * 2000 + (outputs + excess) * 8000,
            'usage': 'KNOWN_TOKENS', 'actualCny': None, 'inputTokens': inputs,
            'outputTokens': outputs, 'excessTokens': excess, 'modelRequests': requests}


def project_usage(source, output):
    raw = Path(source).read_bytes()
    record = json.loads(raw)
    result = {k: record.get(k) for k in ('sampleId', 'mode')}
    result['sourceRecordSha256'] = sha(raw)
    if 'harnessError' in record:
        result['harnessError'] = None if record['harnessError'] is None else 'UPSTREAM_HARNESS_ERROR_REDACTED'
    calls = record.get('modelCalls')
    result['modelCalls'] = [{k: call.get(k) for k in ('provider', 'model', 'status', 'inputTokens', 'outputTokens', 'totalTokens')}
                            if isinstance(call, dict) else None for call in calls] if isinstance(calls, list) else None
    journal = record.get('journal')
    result['journal'] = [{'kind': 'model.request'} for e in journal if isinstance(e, dict) and e.get('kind') == 'model.request'] if isinstance(journal, list) else None
    with Path(output).open('xb') as stream:
        stream.write(json.dumps(result, indent=2).encode() + b'\n')
    Path(output).chmod(0o600)
    return {'projectionSha256': sha(Path(output).read_bytes()), 'sourceRecordSha256': sha(raw)}


def view(state, head):
    settled = sum(e['upperNanos'] for e in state['entries'] if e['state'].startswith('SETTLED'))
    reserved = sum(e['upperNanos'] for e in state['entries'] if e['state'] in ('RESERVED', 'HOLD'))
    remaining = CAP - settled - reserved
    return {**state, 'eventHeadSha256': head, 'auditChainVerified': True,
            'authorizedCapCny': '2', 'knownASpentCny': '0',
            'settledUpperCny': cny(settled), 'reservedUpperCny': cny(reserved),
            'remainingAfterKnownExposureCny': cny(remaining),
            'spendableCny': cny(remaining) if state['bReconciled'] and state['active'] is None else '0',
            'note': 'Conservative task exposure, not a provider wallet balance or actual bill. B prior usage is UNKNOWN until verified claim; A is frozen.'}


def read_state(connection):
    row = connection.execute('SELECT payload,head FROM ledger WHERE id=1').fetchone()
    require(row is not None, 'LEDGER_MISSING')
    state, head = json.loads(row[0]), row[1]
    previous = '0' * 64
    last = None
    count = 0
    for seq, payload, prior, digest in connection.execute('SELECT seq,payload,prior,digest FROM events ORDER BY seq'):
        count += 1
        require(seq == count and prior == previous and digest == sha((prior + payload).encode()), 'EVENT_CHAIN_INVALID')
        last = json.loads(payload)
        previous = digest
    require(previous == head and last is not None and last['stateSha256'] == sha(canonical(state)) and count == state['revision'], 'STATE_CHAIN_MISMATCH')
    return state, head


def append(connection, state, previous, operation, details):
    state['revision'] += 1
    event = {'at': datetime.now(timezone.utc).isoformat(), 'operation': operation,
             'details': details, 'revision': state['revision'], 'stateSha256': sha(canonical(state))}
    payload = canonical(event).decode()
    digest = sha((previous + payload).encode())
    connection.execute('INSERT INTO events VALUES(?,?,?,?)', (state['revision'], payload, previous, digest))
    connection.execute('INSERT OR REPLACE INTO ledger VALUES(1,?,?)', (canonical(state).decode(), digest))
    return view(state, digest)


def operate(directory, operation, **args):
    directory = Path(directory)
    require(directory.is_dir() and not directory.is_symlink(), 'OWNED_DIRECTORY_REQUIRED')
    db = directory / 'budget-ledger.sqlite3'
    if operation == 'init':
        # Exclusive create means existing authorizations can never be reset.
        with db.open('xb'):
            pass
        db.chmod(0o600)
        connection = sqlite3.connect(db, isolation_level=None, timeout=10)
        try:
            connection.execute('BEGIN IMMEDIATE')
            connection.execute('CREATE TABLE ledger(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,head TEXT NOT NULL)')
            connection.execute('CREATE TABLE events(seq INTEGER PRIMARY KEY,payload TEXT NOT NULL,prior TEXT NOT NULL,digest TEXT NOT NULL)')
            opening = Path(args['opening']).read_bytes()
            admission = json.loads(opening)
            require(admission['candidate'] == CANDIDATE and admission['authorizedCapCny'] == '2' and admission['modelRequests'] == 0 and admission['spentCny'] == '0', 'OPENING_A_RECEIPT_MISMATCH')
            state = {'authorizationId': 'D28-20261102-CNY2', 'ledgerId': str(uuid.uuid4()),
                     'candidate': CANDIDATE, 'artifactSha256': ARTIFACT, 'revision': 0,
                     'executionOwner': 'B', 'aExecution': 'FROZEN_AFTER_HANDOFF',
                     'bReconciled': False, 'priorBUsage': 'UNKNOWN', 'active': None,
                     'entries': [], 'openingAReceiptSha256': sha(opening),
                     'authorization': 'User: 本轮最多 2 元，额度不足即停止',
                     'price': {'currency': 'CNY', 'model': 'deepseek-flash', 'inputMissPerMillion': 2, 'outputPerMillion': 8,
                               'source': 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/', 'checkedOn': '2026-11-02'},
                     'taskReservationCny': '0.4'}
            result = append(connection, state, '0' * 64, 'HANDOFF_A_TO_B', {'openingReceiptSha256': sha(opening)})
            connection.execute('COMMIT')
        finally:
            connection.close()
    else:
        require(db.is_file() and not db.is_symlink(), 'CANONICAL_LEDGER_REQUIRED')
        if operation == 'status':
            connection = sqlite3.connect(db.as_uri() + '?mode=ro', uri=True, timeout=10)
            try:
                state, head = read_state(connection)
                return view(state, head)
            finally:
                connection.close()
        connection = sqlite3.connect(db, isolation_level=None, timeout=10)
        try:
            connection.execute('BEGIN IMMEDIATE')
            state, head = read_state(connection)
            details = {}
            if operation == 'claim-b':
                require(not state['bReconciled'] and not state['entries'], 'CLAIM_NOT_REPEATABLE')
                evidence = Path(args['evidence']).read_bytes()
                proof = json.loads(evidence)
                require(proof.get('candidate') == CANDIDATE and proof.get('artifactSha256') == ARTIFACT and
                        proof.get('priorPaidRequests') == 0 and type(proof.get('priorPaidRequests')) is int and
                        proof.get('activePaidJobs') == 0 and type(proof.get('activePaidJobs')) is int and
                        proof.get('priorSpentUpperCny') == '0' and proof.get('measurementSource') and proof.get('evidence'), 'B_PRIOR_USAGE_NOT_RECONCILED')
                for item in proof['evidence']:
                    path = (directory / item['path']).resolve()
                    require(path.is_relative_to(directory.resolve()) and path.is_file() and not path.is_symlink(), 'B_EVIDENCE_PATH_REJECTED')
                    require(sha(path.read_bytes()) == item['sha256'], 'B_EVIDENCE_DIGEST_MISMATCH')
                state['bReconciled'] = True
                state['priorBUsage'] = 'KNOWN_ZERO_FROM_B_MACHINE_EVIDENCE'
                details = {'bReconciliationSha256': sha(evidence)}
            elif operation == 'reserve':
                require(state['bReconciled'], 'B_RECONCILIATION_REQUIRED')
                require(state['active'] is None, 'ANOTHER_SAMPLE_ACTIVE')
                sample = args['sample']
                require(sample in SAMPLES, 'FROZEN_SAMPLE_REQUIRED')
                require(not any(e['sampleId'] == sample for e in state['entries']), 'NEVER_RETRY_SAMPLE')
                remaining = CAP - sum(e['upperNanos'] for e in state['entries'])
                admitted = remaining >= RESERVATION
                entry = {'sampleId': sample, 'reservationId': str(uuid.uuid4()),
                         'state': 'RESERVED' if admitted else 'BUDGET_NOT_STARTED',
                         'upperNanos': RESERVATION if admitted else 0, 'usage': 'UNKNOWN', 'actualCny': None}
                state['entries'].append(entry)
                if admitted:
                    state['active'] = entry['reservationId']
                details = {'admitted': admitted, **entry}
            elif operation == 'settle':
                require(state['active'] == args['reservation'], 'ACTIVE_RESERVATION_MISMATCH')
                record_bytes = Path(args['record']).read_bytes()
                native_bytes = Path(args['native']).read_bytes()
                native, record = json.loads(native_bytes), json.loads(record_bytes)
                entry = next(e for e in state['entries'] if e['reservationId'] == state['active'])
                require(native.get('candidate') == CANDIDATE and native.get('reservationId') == state['active'] and
                        native.get('sampleId') == entry['sampleId'] and native.get('processEnded') is True and
                        type(native.get('nativeExitCode')) is int and native.get('recordSha256') == sha(record_bytes) and
                        record.get('sampleId') == entry['sampleId'], 'NATIVE_TERMINAL_PROOF_REQUIRED')
                cost = exposure(record)
                entry.update(cost, state='SETTLED_KNOWN' if cost['usage'] == 'KNOWN_TOKENS' else 'SETTLED_UNKNOWN')
                require(sum(e['upperNanos'] for e in state['entries']) <= CAP, 'CAP_EXCEEDED')
                state['active'] = None
                details = {'reservationId': entry['reservationId'], 'recordSha256': sha(record_bytes), 'nativeReceiptSha256': sha(native_bytes), **cost}
            else:
                raise ValueError('UNKNOWN_OPERATION')
            result = append(connection, state, head, operation, details)
            if operation == 'reserve':
                result['admitted'] = details['admitted']
                result['reservationId'] = details['reservationId'] if details['admitted'] else None
            connection.execute('COMMIT')
        except BaseException:
            if connection.in_transaction:
                connection.execute('ROLLBACK')
            raise
        finally:
            connection.close()
    # Re-read under the same global write lock: an older caller must not publish
    # a stale JSON snapshot after a newer caller commits. DB remains authoritative.
    export = sqlite3.connect(db, isolation_level=None, timeout=10)
    try:
        export.execute('BEGIN IMMEDIATE')
        latest, latest_head = read_state(export)
        temporary = directory / ('budget-ledger.' + uuid.uuid4().hex + '.tmp')
        temporary.write_bytes(json.dumps(view(latest, latest_head), ensure_ascii=False, indent=2).encode() + b'\n')
        temporary.chmod(0o600)
        temporary.replace(directory / 'budget-ledger.json')
        export.execute('COMMIT')
    finally:
        export.close()
    return result


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', default=str(Path(__file__).resolve().parent))
    commands = parser.add_subparsers(dest='operation', required=True)
    commands.add_parser('status')
    p = commands.add_parser('project-usage'); p.add_argument('--record', required=True); p.add_argument('--output', required=True)
    p = commands.add_parser('init'); p.add_argument('--opening', required=True)
    p = commands.add_parser('claim-b'); p.add_argument('--evidence', required=True)
    p = commands.add_parser('reserve'); p.add_argument('--sample', required=True)
    p = commands.add_parser('settle')
    for name in ('reservation', 'record', 'native'):
        p.add_argument('--' + name, required=True)
    args = vars(parser.parse_args()); directory = str(Path(args.pop('directory')).resolve()); operation = args.pop('operation')
    try:
        if operation == 'project-usage':
            print(json.dumps(project_usage(args['record'], args['output'])))
            return 0
        result = operate(directory, operation, **args)
        print(json.dumps(result, ensure_ascii=False))
        return 3 if result.get('admitted') is False else 0
    except Exception as error:
        print(json.dumps({'status': 'DENIED_OR_UNKNOWN', 'errorType': type(error).__name__,
                          'reason': str(error), 'action': 'Read canonical status; never reset, repeat a reservation, or launch on unknown outcome.'}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
