"""Linux-only, no model/Docker: private publication receipt read boundary."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
import uuid
import base64
import struct
from unittest import mock

source = Path(os.environ.get('CODELESS_WORKER_UNDER_TEST', Path(__file__).parents[2] / 'infra/public/worker.py'))
spec = importlib.util.spec_from_file_location('public_worker', source)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class CoverReceiptPermissions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='cover-receipt-')
        self.root = Path(self.temp.name).resolve()
        self.previous = worker.ROOT
        worker.ROOT = self.root
        self.identifier, self.version = str(uuid.uuid4()), str(uuid.uuid4())
        self.path = self.root / 'publication/sites' / self.identifier / '__deployment.json'
        self.path.parent.mkdir(parents=True)
        self.receipt = {'deploymentId': self.identifier, 'versionId': self.version,
                        'artifactDigest': 'sha256:' + 'a' * 64, 'url': 'https://example.invalid/'}
        self.path.write_text(json.dumps(self.receipt)); self.path.chmod(0o600)
        self.bytes = self.path.read_bytes()
        self.request = {'action': 'publish', 'payload': {'publicationId': self.identifier,
                        'versionId': self.version, 'artifactDigest': self.receipt['artifactDigest']}}
        self.config = {'apiUid': os.geteuid() + 1,
                       'CODELESS_PLATFORM_ORIGIN':'https://app.codeless-platform.top',
                       'CODELESS_PREVIEW_ORIGIN':'https://preview.codeless-preview.top',
                       'CODELESS_PUBLICATION_ORIGIN':'https://sites.codeless-publish.top'}
        self.output = json.dumps({'url': self.receipt['url']}).encode()
    def tearDown(self):
        worker.ROOT = self.previous
        assert self.root == Path(self.temp.name).resolve()
        self.temp.cleanup()
    def share(self):
        # The baseline is a no-op: the production API cannot read its 0600 receipt.
        function = getattr(worker, 'share_publication_receipt', None)
        if function: function(self.config, json.dumps(self.request).encode(), self.output)
    def test_api_group_read_keeps_bytes_and_denies_other_or_group_write(self):
        self.share()
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o640)
        self.assertEqual(self.path.read_bytes(), self.bytes)
        self.share(); self.assertEqual(self.path.read_bytes(), self.bytes)
    def test_foreign_version_is_not_shared(self):
        self.request['payload']['versionId'] = str(uuid.uuid4())
        with self.assertRaises(ValueError): self.share()
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
    def test_symlink_and_hardlink_receipts_are_not_shared(self):
        original = self.path.with_name('original'); self.path.rename(original); self.path.symlink_to(original)
        with self.assertRaises(OSError): self.share()
        self.path.unlink(); os.link(original, self.path)
        with self.assertRaises(ValueError): self.share()
        self.assertEqual(original.stat().st_mode & 0o777, 0o600)
    def test_world_readable_receipt_is_rejected(self):
        self.path.chmod(0o644)
        with self.assertRaises(ValueError): self.share()
    def test_caller_cannot_share_outside_fixed_uuid_root(self):
        self.request['payload']['publicationId'] = '../outside'
        with self.assertRaises(ValueError): self.share()
    def test_probe_and_wrong_response_cannot_change_receipt(self):
        self.request['action'] = 'probe'
        with self.assertRaises(ValueError): self.share()
        self.request['action'] = 'publish'; self.output = b'{"url":"https://other.invalid/"}'
        with self.assertRaises(ValueError): self.share()
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
    def run_broker_publish(self):
        data=json.dumps(self.request).encode();body=json.dumps({'argv':[],'input':base64.b64encode(data).decode()}).encode()
        class Connection:
            def __init__(c): c.buffer=struct.pack('!I',len(body))+body; c.result=b''
            def getsockopt(c,*args): return struct.pack('3i',123,self.config['apiUid'],os.getegid())
            def settimeout(c,*args): pass
            def recv(c,n): value=c.buffer[:n];c.buffer=c.buffer[n:];return value
            def sendall(c,value): c.result=value
        class Child:
            returncode=0
            def communicate(c,value): return self.output,b''
        connection=Connection()
        with mock.patch.object(worker,'binding',return_value=([],data,10,8192,'publish')), \
             mock.patch.object(worker.subprocess,'Popen',return_value=Child()), \
             mock.patch.object(worker,'reclaim_processes',return_value=True), \
             mock.patch.object(worker,'cleanup',return_value=True), \
             mock.patch.object(worker.select,'select',return_value=([],[],[])):
            worker.handle(connection,self.config)
        return json.loads(connection.result[4:])
    def test_successful_broker_ack_waits_for_receipt_read_access(self):
        response=self.run_broker_publish();self.assertEqual(response['exit'],0)
        self.assertEqual(self.path.stat().st_mode & 0o777,0o640)
    def test_broker_does_not_ack_a_foreign_receipt(self):
        self.request['payload']['versionId']=str(uuid.uuid4())
        response=self.run_broker_publish();self.assertEqual(response['exit'],2)
        self.assertEqual(self.path.stat().st_mode & 0o777,0o600)

if __name__ == '__main__':
    unittest.main()
