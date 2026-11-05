ALTER TABLE publications DROP CONSTRAINT publications_status_check;
ALTER TABLE publications ADD CONSTRAINT publications_status_check CHECK (status IN ('REQUESTED','PUBLISHED','FAILED','UNPUBLISHED'));
CREATE OR REPLACE FUNCTION check_publication_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.application_id IS DISTINCT FROM OLD.application_id OR
        NEW.version_id IS DISTINCT FROM OLD.version_id OR
        NEW.requested_by IS DISTINCT FROM OLD.requested_by OR
        (OLD.status IN ('PUBLISHED', 'FAILED', 'UNPUBLISHED') AND NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status IN ('PUBLISHED','FAILED') AND NEW.status = 'UNPUBLISHED'))
    ) THEN
        RAISE EXCEPTION 'publication identity and final status are immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM applications a
        JOIN application_versions v ON v.application_id = a.id
        WHERE a.id = NEW.application_id AND a.owner_id = NEW.requested_by
          AND v.id = NEW.version_id AND v.status = 'VERIFIED'
    ) THEN
        RAISE EXCEPTION 'publication requires the owner and a verified version' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE INDEX generation_tasks_daily_usage_idx ON generation_tasks(application_id, created_at);
