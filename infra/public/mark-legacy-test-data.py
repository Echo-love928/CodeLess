#!/usr/bin/env python3
"""Idempotent provenance repair for explicitly identified historical acceptance applications.

No account is classified merely because it is demo, no failed outcome is erased,
and no model-call or financial reservation is deleted. Default is read-only.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import uuid

KNOWN = {
 'd83b28da-198c-4477-85e3-420ecbf83582': 'D15 公网验收 ',
 '834f36e1-4916-4fd2-bbce-2e54172483e6': 'D15 公网验收 ',
 '30371ff0-f54b-4de3-b430-b161a694f3a2': 'D15 公网验收 ',
 '10763ea1-4bd9-4046-aa40-50e733ea6cce': 'D15 公网验收 ',
 '5af1ac77-72f2-42dc-9030-1f85296564b7': 'D15 公网验收 ',
 'c49612da-859b-43ed-9e0e-ccd3135079a8': 'D15 公网验收 ',
 '8a90ae7a-3139-45de-81e4-c6cb6a56531b': 'D28 同源验收 ',
 '04fc5fc3-6a68-404b-a5d3-0005d4dc67f4': 'D30 上线核验 ',
 '36271fae-1794-43c4-9af4-c21ee4ccc7bd': 'DeepSeek 真实博客验证 ',
 'b4262864-0b84-4f37-af7e-bca2175b9de2': 'test-超长名称',
 '20f1313c-cf69-460b-abe5-4c6c132cae62': 'test-取消测试',
}
def sql(q):
 return subprocess.run(['docker','exec','-i','codeless-public-postgres-1','psql','-X','-U','codeless','-d','codeless','-At','-v','ON_ERROR_STOP=1'],input=q,text=True,capture_output=True,check=True).stdout.strip()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');options=parser.parse_args()
 candidates=json.loads(sql("SELECT coalesce(json_agg(json_build_object('id',id,'name',name)),'[]') FROM applications WHERE id IN ("+','.join("'"+str(uuid.UUID(i))+"'" for i in KNOWN)+")"))
 statements=[];classified=[]
 for row in candidates:
  if not row['name'].startswith(KNOWN[row['id']]):
   raise RuntimeError('Legacy application identity changed; operator review required')
  statements.append("UPDATE applications SET is_test=true,test_reason='Explicit legacy acceptance/test application; retained for audit' WHERE id='"+row['id']+"';")
  classified.append(row['id'])
 # Only the explicitly reported blog is archived here, and only when no active work exists.
 blog='36271fae-1794-43c4-9af4-c21ee4ccc7bd'
 statements.append("UPDATE applications a SET status='ARCHIVED',updated_at=now(),row_version=row_version+1 WHERE id='"+blog+"' AND status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM generation_tasks t WHERE t.application_id=a.id AND t.queue_state IN ('QUEUED','RUNNING'));")
 rows=json.loads(sql("SELECT coalesce(json_agg(id),'[]') FROM publications WHERE status='FAILED' AND failure_code IS NULL"))
 reasons={}
 for value in rows:
  identifier=str(uuid.UUID(value));directory=Path('/srv/codeless/private/agent/deployments')/identifier
  if not directory.is_dir() or directory.is_symlink():continue
  for file in sorted(directory.glob('*.json'),key=lambda p:int(p.stem) if p.stem.isdigit() else -1):
   if not file.stem.isdigit() or file.is_symlink() or file.stat().st_size>16384:continue
   event=json.loads(file.read_text())
   code=event.get('failureCode')
   if event.get('phase')=='FAILED' and isinstance(code,str) and re.fullmatch('[A-Z][A-Z0-9_]{1,99}',code):reasons[identifier]=code
 for identifier,code in reasons.items():
  statements.append("UPDATE publications SET failure_code='"+code+"' WHERE id='"+identifier+"' AND status='FAILED' AND failure_code IS NULL;")
 if options.apply:sql('BEGIN;'+''.join(statements)+'COMMIT;')
 print(json.dumps({'applied':options.apply,'classifiedApplications':classified,'deploymentFailureReasons':reasons,'modelCallsDeleted':0,'financialLedgerModified':False}))
if __name__=='__main__':main()
