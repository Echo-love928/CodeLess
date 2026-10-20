-- Dedicated disposable DB only; factual records, no mocked HTTP responses.
INSERT INTO applications(id,owner_id,name,data_mode,created_at)
SELECT '88888888-8888-4888-8888-888888888888',id,'真实后台联调应用','MOCK','2026-10-20T04:00:00Z'
FROM platform_users WHERE email='demo@codeless.local';
INSERT INTO generation_tasks(id,application_id,prompt,status,failure_code,repair_attempts,created_at)
SELECT ('11111111-1111-4111-8111-'||lpad(n::text,12,'0'))::uuid,'88888888-8888-4888-8888-888888888888',
 '管理联调 api_key=sk-live-fixture-private-value',
 CASE WHEN n=1 THEN 'READY' WHEN n IN(2,3,4) THEN 'FAILED' ELSE 'GENERATE' END,
 CASE WHEN n=2 THEN 'BUILD_EXIT' WHEN n=3 THEN 'CANCELLED' WHEN n=4 THEN 'INTERRUPTED' ELSE NULL END,
 CASE WHEN n=1 THEN 2 ELSE 0 END,'2026-10-20T04:00:00Z' FROM generate_series(1,25) n;
-- One leased task proves cancellation clears a real live lease.
UPDATE generation_tasks SET queue_state='RUNNING',lease_token='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
lease_expires_at=now()+interval '1 day',deadline_at=now()+interval '1 day'
WHERE id='11111111-1111-4111-8111-000000000025';
INSERT INTO application_versions(id,application_id,number,source_digest,status)
VALUES('22222222-2222-4222-8222-222222222222','88888888-8888-4888-8888-888888888888',1,'sha256:'||repeat('a',64),'DRAFT');
INSERT INTO builds(id,task_id,version_id,status,exit_code,artifact_digest,completed_at)
VALUES('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-000000000001',
'22222222-2222-4222-8222-222222222222','SUCCEEDED',0,'sha256:'||repeat('b',64),now());
UPDATE application_versions SET status='VERIFIED',build_id='33333333-3333-4333-8333-333333333333';
INSERT INTO publications(id,application_id,version_id,requested_by,status,url,published_at,created_at)
SELECT ('44444444-4444-4444-8444-'||lpad(n::text,12,'0'))::uuid,'88888888-8888-4888-8888-888888888888',
'22222222-2222-4222-8222-222222222222',u.id,CASE WHEN n=1 THEN 'PUBLISHED' WHEN n=4 THEN 'REQUESTED' ELSE 'FAILED' END,
CASE WHEN n=1 THEN 'https://fixture.codeless-public.test/' ELSE NULL END,CASE WHEN n=1 THEN now() ELSE NULL END,'2026-10-20T04:00:00Z'
FROM platform_users u CROSS JOIN generate_series(1,4) n WHERE u.email='demo@codeless.local';
INSERT INTO model_calls(id,task_id,stage,provider,model,status,input_tokens,output_tokens,error_code,completed_at,created_at)
SELECT ('55555555-5555-4555-8555-'||lpad(n::text,12,'0'))::uuid,'11111111-1111-4111-8111-000000000001',
'GENERATE','deterministic-mock','fixture-records-no-model-invocation',CASE WHEN n=5 THEN 'REQUESTED' WHEN n=4 THEN 'FAILED' ELSE 'SUCCEEDED' END,
CASE WHEN n=1 THEN 100 WHEN n=2 THEN 0 WHEN n=4 THEN 7 ELSE NULL END,
CASE WHEN n=1 THEN 50 WHEN n=2 THEN 0 ELSE NULL END,CASE WHEN n=4 THEN 'MODEL_NETWORK' ELSE NULL END,
CASE WHEN n=5 THEN NULL ELSE now() END,'2026-10-20T04:00:00Z' FROM generate_series(1,5) n;
