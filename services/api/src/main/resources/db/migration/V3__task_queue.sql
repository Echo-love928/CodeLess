ALTER TABLE generation_tasks
    ADD COLUMN idempotency_key varchar(128),
    ADD COLUMN queue_state varchar(16) NOT NULL DEFAULT 'FINISHED'
        CHECK (queue_state IN ('QUEUED', 'RUNNING', 'FINISHED')),
    ADD COLUMN lease_token uuid,
    ADD COLUMN lease_expires_at timestamptz,
    ADD COLUMN deadline_at timestamptz;

ALTER TABLE generation_tasks ADD CONSTRAINT generation_tasks_queue_shape CHECK (
    (queue_state = 'RUNNING' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND deadline_at IS NOT NULL)
    OR (queue_state <> 'RUNNING' AND lease_token IS NULL AND lease_expires_at IS NULL)
);
CREATE UNIQUE INDEX generation_tasks_idempotency_key
    ON generation_tasks(application_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX generation_tasks_one_running_per_application
    ON generation_tasks(application_id) WHERE queue_state = 'RUNNING';
CREATE INDEX generation_tasks_queue_order
    ON generation_tasks(created_at, id) WHERE queue_state = 'QUEUED';
