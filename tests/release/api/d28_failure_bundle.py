"""Collect named retained A failures only; never reconstruct missing telemetry.

Raw evidence stays in a task-private archive. A current SHA is distinguished
from a digest anchored in the original command receipt.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[3]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def collect(root, output):
    root, output = Path(root).resolve(), Path(output).resolve()
    private = root / 'tests/release/api/.private'
    if not output.is_relative_to(private) or output.exists():
        raise ValueError('FRESH_TASK_PRIVATE_OUTPUT_REQUIRED')
    evidence = root / 'tests/release/api/evidence'
    api = json.loads((evidence / 'd28/api-failure.json').read_bytes())
    chain = json.loads((evidence / 'd28-followup/original-failure-chain.json').read_bytes())
    gate_path = evidence / '2026-11-01T04-56-43.858254+00-00-gate/command.json'
    gate = json.loads(gate_path.read_bytes())
    current_gate = json.loads((evidence / 'd28/2026-11-01T14-32-37.236887+00-00-gate/command.json').read_bytes())
    files, payloads = [], {}

    def add(path, group, expected=None):
        path = Path(path)
        relative = path.relative_to(root)
        if any(p.is_symlink() or getattr(p, 'is_junction', lambda: False)() for p in [path, *path.parents] if p != root):
            raise ValueError('EVIDENCE_LINK_REJECTED')
        raw = path.read_bytes()
        digest = sha(raw)
        if expected is not None and digest != expected:
            raise ValueError('ORIGINAL_DIGEST_MISMATCH: ' + str(relative))
        name = f'{len(files):03d}-' + path.name
        files.append({'member': name, 'source': relative.as_posix(), 'group': group,
                      'bytes': len(raw), 'sha256': digest,
                      'digestAnchoredInPriorReceipt': expected is not None})
        payloads[name] = raw

    for item in api['rawEvidence']:
        add(root / item['privateCopy'], 'EPERM_SAME_FAILURE', item['sha256'])
    cleanup = chain['cleanupFailed']
    add(root / cleanup['privateRawLog'], 'CLEANUP_FAILED_SAME_CI_FAILURE', cleanup['rawLogSha256'])
    add(root / gate['privateLog'], 'ENOTEMPTY_SAME_GATE', gate['logSha256'])
    add(gate_path, 'ENOTEMPTY_COMMAND_RECEIPT')
    # This file was retained on disk, but has no separately recorded original
    # hash. Do not promote its newly calculated hash into an old attestation.
    add(root / '.local-data/d22-b/2026-11-01T05-32-23.730Z-d46db954-ba6b-4c09-9800-70607fe3287f/report.json',
        'ENOTEMPTY_RETAINED_REPORT_CURRENT_DIGEST_ONLY')
    add(root / current_gate['commands'][1]['privateLog'], 'EPERM_SAME_GATE', current_gate['commands'][1]['logSha256'])
    for name in ('d28/api-failure.json', 'd28-followup/original-failure-chain.json',
                 'd28-fix/windows-file-trace.json'):
        add(evidence / name, 'PROVENANCE_OR_DISTINCT_PASSING_TRACE_SUMMARY')
    manifest = {'task': 'D28-A-original-failures', 'at': datetime.now(timezone.utc).isoformat(),
                'files': files, 'sameFailureKernelHandleTraceAvailable': False,
                'sameFailureRejectionStackAvailable': False,
                'cleanupSameFailureRunnerReceiptAvailable': False,
                'rootCause': None, 'acceptance': 'HOLD', 'paidModelRequests': 0,
                'warning': 'Passing Windows ETW summary is separate evidence, not the original EPERM failure.'}
    manifest_raw = json.dumps(manifest, ensure_ascii=False, indent=2).encode() + b'\n'
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('xb') as stream:
        with tarfile.open(fileobj=stream, mode='w') as archive:
            for name, data in {'MANIFEST.json': manifest_raw, **payloads}.items():
                info = tarfile.TarInfo(name)
                info.size, info.mode = len(data), 0o600
                archive.addfile(info, io.BytesIO(data))
    output.chmod(0o600)
    # Independent member readback, no extraction or path rewriting.
    with tarfile.open(output) as archive:
        actual = archive.getmembers()
        assert len(actual) == len(files) + 1 and all(m.isfile() for m in actual)
        for item in files:
            assert sha(archive.extractfile(item['member']).read()) == item['sha256']
    return {'archive': output.relative_to(root).as_posix(), 'bytes': output.stat().st_size,
            'sha256': sha(output.read_bytes()), 'manifestSha256': sha(manifest_raw),
            'members': len(files) + 1, 'files': files, 'acceptance': 'HOLD',
            'sameFailureStackOrHandleTraceRecovered': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print(json.dumps(collect(ROOT, args.output), indent=2))
