-- Persist the actual generating task before a candidate is built, including
-- drafts and unavailable-worker failures. Historical unknowns stay unknown.
ALTER TABLE generation_tasks ADD CONSTRAINT generation_tasks_application_id_id_key
    UNIQUE (application_id, id);
ALTER TABLE application_versions ADD COLUMN source_task_id uuid;
ALTER TABLE application_versions ADD CONSTRAINT application_versions_source_task_fk
    FOREIGN KEY (application_id, source_task_id)
    REFERENCES generation_tasks(application_id, id) ON DELETE RESTRICT;

-- A version with multiple task associations is ambiguous; do not pick the
-- newest build or infer a task from creation time or the current workbench.
UPDATE application_versions v SET source_task_id = origin.task_id
FROM (
    SELECT b.version_id, (array_agg(DISTINCT b.task_id))[1] AS task_id
    FROM builds b JOIN generation_tasks t ON t.id = b.task_id
    JOIN application_versions existing ON existing.id = b.version_id
    GROUP BY b.version_id
    HAVING count(DISTINCT b.task_id) = 1
       AND bool_and(t.application_id = existing.application_id)
) origin
WHERE v.id = origin.version_id;

CREATE FUNCTION prevent_version_source_task_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.source_task_id IS DISTINCT FROM OLD.source_task_id THEN
        RAISE EXCEPTION 'application version source task is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER application_version_source_task_immutable
    BEFORE UPDATE OF source_task_id ON application_versions
    FOR EACH ROW EXECUTE FUNCTION prevent_version_source_task_change();
