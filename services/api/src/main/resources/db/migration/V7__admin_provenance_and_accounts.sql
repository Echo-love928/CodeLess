ALTER TABLE platform_users ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE applications ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE applications ADD COLUMN test_reason varchar(200);
ALTER TABLE publications ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE publications ADD COLUMN failure_code varchar(100);
ALTER TABLE generation_tasks ADD COLUMN cancelled_by varchar(16) CHECK (cancelled_by IN ('USER','ADMIN','UNKNOWN'));
ALTER TABLE auth_credentials ADD COLUMN session_version bigint NOT NULL DEFAULT 0;
UPDATE generation_tasks t SET cancelled_by=CASE
 WHEN EXISTS(SELECT 1 FROM task_events e WHERE e.task_id=t.id AND e.type='TASK_FAILED' AND e.message='Task cancelled by administrator') THEN 'ADMIN'
 WHEN EXISTS(SELECT 1 FROM task_events e WHERE e.task_id=t.id AND e.type='TASK_FAILED' AND e.message='Task cancelled by user') THEN 'USER'
 ELSE 'UNKNOWN' END WHERE failure_code='CANCELLED';
CREATE TABLE admin_user_actions (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES platform_users(id),
 target_id uuid NOT NULL REFERENCES platform_users(id), action varchar(32) NOT NULL,
 previous_status varchar(16), resulting_status varchar(16), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_user_actions_created_idx ON admin_user_actions(created_at DESC);
