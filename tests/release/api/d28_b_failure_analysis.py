"""Read-only analysis of B's five explicitly separated original batches.

Never emits cookies, auth headers, URL queries, source, or complete traces.
Missing native results and incomplete HTTP snapshots remain unknown.
"""
import argparse
from datetime import datetime
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
from statistics import median
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
import zipfile


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def utc(value):
    date = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(date.tzinfo is not None, 'TIMEZONE_REQUIRED')
    return date.timestamp()


def junit_counts(raw_files):
    counts = dict.fromkeys(('tests', 'failures', 'errors', 'skipped'), 0 if raw_files else None)
    failed = []
    for name, raw in raw_files:
        require(b'<!DOCTYPE' not in raw.upper(), 'JUNIT_DTD_REJECTED')
        suite = ET.fromstring(raw)
        require(suite.tag == 'testsuite', 'EXPECTED_JUNIT_TESTSUITE')
        for key in counts:
            value = suite.get(key)
            require(value is None or re.fullmatch(r'\d+', value), 'INVALID_JUNIT_COUNT')
            counts[key] = None if value is None or counts[key] is None else counts[key] + int(value)
        for case in suite.findall('testcase'):
            if case.find('failure') is not None or case.find('error') is not None:
                failed.append({'class': case.get('classname'), 'method': case.get('name')})
    return {'junitFiles': len(raw_files), **counts, 'failedCases': failed}


def download_timeline(rows, network, version):
    before = {r['callId']: r for r in rows if r.get('type') == 'before'}
    after = {r['callId']: r for r in rows if r.get('type') == 'after'}
    failures = [r for r in after.values() if 'download' in (r.get('error') or {}).get('message', '')]
    require(len(failures) == 1, 'ONE_DOWNLOAD_FAILURE_REQUIRED')
    end = failures[0]
    start = before[end['callId']]
    clicks = [r for r in before.values() if r.get('method') == 'click' and
              '下载源码' in r.get('params', {}).get('selector', '') and
              start['startTime'] <= r['startTime'] < end['endTime']]
    require(len(clicks) == 1, 'ONE_SAME_WINDOW_SOURCE_CLICK_REQUIRED')
    click = clicks[0]
    click_logs = [r for r in rows if r.get('type') == 'log' and r.get('callId') == click['callId']]
    resolved = next((r.get('time') for r in click_logs if 'locator resolved to' in r.get('message', '')), None)
    performed = next((r.get('time') for r in click_logs if r.get('message', '').strip() == 'performing click action'), None)
    exports = [r for r in network if urlsplit(r['request']['url']).path == f'/api/v0/versions/{version}/export' and
               r.get('_monotonicTime') is not None and click['startTime'] <= r['_monotonicTime'] < end['endTime']]
    require(len(exports) == 1, 'ONE_SAME_VERSION_EXPORT_REQUIRED')
    request = exports[0]
    status = request['response'].get('status')
    response_ms = request.get('time')
    return {'waitCallId': start['callId'], 'clickCallId': click['callId'],
            'listenerStartMs': start['startTime'], 'listenerFailureMs': end['endTime'],
            'locatorResolvedMs': resolved, 'clickPerformedMs': performed,
            'clickCompletedMs': after.get(click['callId'], {}).get('endTime'),
            'listenerToLocatorMs': None if resolved is None else round(resolved - start['startTime'], 3),
            'exportRequestMs': request['_monotonicTime'], 'exportRequestAt': request.get('startedDateTime'),
            'listenerToExportMs': round(request['_monotonicTime'] - start['startTime'], 3),
            'exportObservationBeforeFailureMs': round(end['endTime'] - request['_monotonicTime'], 3),
            'exportHttpStatus': status if isinstance(status, int) and status >= 100 else None,
            'exportDurationMs': response_ms if isinstance(response_ms, (int, float)) and response_ms >= 0 else None,
            'exportCompleted': isinstance(status, int) and status >= 100 and isinstance(response_ms, (int, float)) and response_ms >= 0,
            'nativeDownloadResult': 'FAILED_ORIGINAL_10000MS_EVENT_DEADLINE',
            'backendRootCause': None,
            'limit': 'Listener deadline includes pre-click locator wait. An unfinished HAR response does not prove server receipt, HTTP success or network cause.'}


def sampled_worker(rows, pid, started_at, completed_at):
    start, end = utc(started_at), utc(completed_at)
    accepted, excluded = [], 0
    for row in rows:
        at = utc(row['at'])
        if not start <= at <= end:
            continue
        for process in row['processes']:
            if process['ProcessId'] != pid:
                continue
            created = utc(process['CreationDate'])
            if not start <= created <= at:
                excluded += 1
                continue
            accepted.append({'sampleAt': row['at'], 'pid': pid, 'createdAt': process['CreationDate'],
                             'parentPid': process['ParentProcessId']})
    return {'samples': accepted, 'excludedTemporalIdentities': excluded,
            'nativeKillExitCode': None, 'refusalStack': None, 'kernelHandles': None,
            'limit': 'Sample presence/absence is not a kill/exit/handle proof; numeric PID alone cannot identify ownership.'}


def cleanup_timeouts(log, runner_stage):
    require(runner_stage['stage'] == 'verify:runner', 'ORIGINAL_RUNNER_STAGE_REQUIRED')
    start, end = utc(runner_stage['startedAt']), utc(runner_stage['completedAt'])
    matches, other = [], []
    for number, line in enumerate(log.splitlines(), 1):
        if '"failure":"CLEANUP_TIMEOUT"' not in line:
            continue
        value, _ = json.JSONDecoder().raw_decode(line[line.index('{'):])
        if value.get('failure') != 'CLEANUP_TIMEOUT':
            continue
        row = {**value, 'originalCommandLogLine': number}
        if start <= utc(value['startedAt']) <= utc(value['completedAt']) <= end:
            matches.append(row)
        else:
            other.append({k: row.get(k) for k in ('id', 'startedAt', 'completedAt', 'workerPid', 'failure', 'originalCommandLogLine')})
    require(len(matches) == 1, 'ONE_ORIGINAL_RUNNER_CLEANUP_TIMEOUT_REQUIRED')
    return matches[0], other


class Originals:
    def __init__(self, directory):
        self.root = Path(directory).resolve()
        manifest_raw = (self.root / 'MANIFEST.json').read_bytes()
        receipt = json.loads((self.root / 'RECEIPT.json').read_bytes())
        require(sha(manifest_raw) == receipt['manifestSha256'], 'MANIFEST_DIGEST_MISMATCH')
        self.manifest = json.loads(manifest_raw)
        self.files = self.manifest['files']
        require(len(self.files) == self.manifest['fileCount'] == receipt['verifiedFiles'] and
                sum(row['bytes'] for row in self.files.values()) == self.manifest['payloadBytes'], 'ORIGINAL_MANIFEST_COUNTS_MISMATCH')
        self.flat = json.loads((self.root / 'local-index.json').read_bytes()) if (self.root / 'local-index.json').exists() else None
        for name in self.files:
            self.read(name)

    def read(self, name):
        relative = PurePosixPath(name)
        require(not relative.is_absolute() and '..' not in relative.parts and '\\' not in name, 'ORIGINAL_PATH_REJECTED')
        path = Path(os.path.abspath(self.flat[name]['local'])) if self.flat else self.root / name
        require(path.resolve().is_relative_to(self.root) and path.is_file() and not path.is_symlink(), 'ORIGINAL_FILE_REJECTED')
        require(all(not p.is_symlink() and not getattr(p, 'is_junction', lambda: False)() for p in [path, *path.parents] if p != self.root), 'ORIGINAL_LINK_REJECTED')
        raw = path.read_bytes()
        expected = self.files[name]
        require(len(raw) == expected['bytes'] and sha(raw) == expected['sha256'], 'ORIGINAL_DIGEST_MISMATCH')
        return raw

    def data(self, name):
        return json.loads(self.read(name))


def analyze(directory):
    source = Originals(directory)
    cases = source.data('CASES.json')['cases']
    report = {'task': 'D28-A-B-original-analysis', 'manifestSha256': sha((source.root / 'MANIFEST.json').read_bytes()),
              'verifiedFiles': len(source.files), 'verifiedBytes': sum(r['bytes'] for r in source.files.values()), 'cases': []}
    for case in cases:
        prefix = 'cases/' + case['case'] + '/'
        suites = [(name, source.read(name)) for name in source.files if name.startswith(prefix) and '/junit/' in name and name.endswith('.xml')]
        report['cases'].append({'case': case['case'], 'candidate': case['candidate'], 'nativeExitCode': case['nativeExitCode'],
                                'batch': case['batch'], 'originalGaps': case['gaps'], 'junit': junit_counts(suites)})
    # Only case04 contains the failed download. Never borrow case05 lifecycle.
    actor = source.data('cases/04-7db-redownload/flow/identities.json')['actors'][0]
    trace_name = next(name for name in source.files if name.startswith('cases/04-') and name.endswith('/trace.zip'))
    with zipfile.ZipFile(io.BytesIO(source.read(trace_name))) as archive:
        require(sum(e.file_size for e in archive.infolist()) < 256 * 1024 * 1024, 'TRACE_SIZE_REJECTED')
        candidates = []
        for name in archive.namelist():
            if not re.fullmatch(r'\d+-trace\.trace', name):
                continue
            rows = [json.loads(line) for line in archive.read(name).splitlines()]
            if any(r.get('type') == 'after' and 'download' in (r.get('error') or {}).get('message', '') for r in rows):
                network = [json.loads(line)['snapshot'] for line in archive.read(name.replace('.trace', '.network')).splitlines()]
                candidates.append({'contextTrace': name, **download_timeline(rows, network, actor['edited'])})
        require(len(candidates) == 1, 'ONE_SAME_BATCH_DOWNLOAD_CONTEXT_REQUIRED')
        report['download'] = {'originalTraceSha256': source.files[trace_name]['sha256'], **candidates[0]}
    log_raw = source.read('cases/02-00fd-d19-full-gate/command.log')
    try:
        log = log_raw.decode('utf-8')
        text_replacement = False
    except UnicodeDecodeError:
        # Interleaved native command output need not be valid UTF-8. Preserve
        # the verified raw bytes; replacement is for locating ASCII JSON only.
        log = log_raw.decode('utf-8', errors='replace')
        text_replacement = True
    report['case02CommandLogTextReplacementUsed'] = text_replacement
    stages = [json.loads(line) for line in source.read('cases/02-00fd-d19-full-gate/stages.jsonl').splitlines()]
    runner_stage, = [row for row in stages if row['stage'] == 'verify:runner']
    failure, other = cleanup_timeouts(log, runner_stage)
    report['case02OtherStageCleanupTimeouts'] = other
    rows = [json.loads(line) for line in source.read('cases/02-00fd-d19-full-gate/process-metadata.jsonl').decode('utf-8-sig').splitlines()]
    intervals = [utc(b['at']) - utc(a['at']) for a, b in zip(rows, rows[1:])]
    report['D19'] = {k: failure.get(k) for k in ('id', 'startedAt', 'completedAt', 'workerPid', 'workerExitCode', 'timedOut', 'phase', 'failure', 'cleanup', 'originalCommandLogLine')}
    report['D19']['workerSampling'] = sampled_worker(rows, failure['workerPid'], failure['startedAt'], failure['completedAt'])
    report['D19']['medianSamplerIntervalSeconds'] = round(median(intervals), 3)
    report['D19']['rootCause'] = None
    report.update(rootCauseClosed=False, acceptance='HOLD', productionChanged=False, paidModelRequests=0)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = analyze(args.directory)
    # Derived receipts are reproducible across Windows/Linux. Original input
    # bytes are never changed or normalized to make a digest match.
    with Path(args.output).open('xb') as stream:
        stream.write(json.dumps(result, ensure_ascii=False, indent=2).encode('utf-8') + b'\n')
    print(json.dumps({'verifiedFiles': result['verifiedFiles'], 'caseCount': len(result['cases']),
                      'acceptance': result['acceptance'], 'rootCauseClosed': False}))
