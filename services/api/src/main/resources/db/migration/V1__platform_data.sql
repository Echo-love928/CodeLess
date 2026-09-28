CREATE TABLE platform_users (
    id uuid PRIMARY KEY,
    email varchar(320) NOT NULL,
    display_name varchar(120) NOT NULL,
    status varchar(16) NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
    row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT platform_users_email_nonblank CHECK (length(btrim(email)) > 0),
    CONSTRAINT platform_users_display_name_nonblank CHECK (length(btrim(display_name)) > 0)
);
CREATE UNIQUE INDEX platform_users_email_key ON platform_users (lower(email));

CREATE TABLE applications (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE RESTRICT,
    name varchar(120) NOT NULL CHECK (length(btrim(name)) > 0),
    description varchar(1000),
    template varchar(8) NOT NULL DEFAULT 'VUE' CHECK (template = 'VUE'),
    data_mode varchar(16) NOT NULL CHECK (data_mode IN ('STATIC', 'MOCK', 'LOCAL_STORAGE')),
    status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    latest_ready_version_id uuid,
    row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX applications_owner_id_idx ON applications(owner_id);

CREATE TABLE generation_tasks (
    id uuid PRIMARY KEY,
    application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
    prompt varchar(8000) NOT NULL CHECK (length(btrim(prompt)) > 0),
    status varchar(16) NOT NULL DEFAULT 'PLAN'
        CHECK (status IN ('PLAN', 'GENERATE', 'VERIFY', 'REPAIR', 'READY', 'FAILED')),
    repair_attempts smallint NOT NULL DEFAULT 0 CHECK (repair_attempts BETWEEN 0 AND 3),
    failure_code varchar(100),
    event_sequence integer NOT NULL DEFAULT 0 CHECK (event_sequence >= 0),
    row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT generation_tasks_failure_code_check
        CHECK ((status = 'FAILED' AND failure_code IS NOT NULL AND length(btrim(failure_code)) > 0) OR
               (status <> 'FAILED' AND failure_code IS NULL))
);
CREATE INDEX generation_tasks_application_id_idx ON generation_tasks(application_id);

CREATE TABLE task_events (
    id uuid PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES generation_tasks(id) ON DELETE RESTRICT,
    sequence integer NOT NULL CHECK (sequence > 0),
    type varchar(24) NOT NULL
        CHECK (type IN ('STAGE_STARTED', 'STAGE_COMPLETED', 'TOOL_RESULT', 'REPAIR_REQUESTED', 'TASK_FAILED')),
    stage varchar(16) NOT NULL
        CHECK (stage IN ('PLAN', 'GENERATE', 'VERIFY', 'REPAIR', 'READY', 'FAILED')),
    message varchar(2000) NOT NULL CHECK (length(btrim(message)) > 0),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT task_events_task_sequence_key UNIQUE (task_id, sequence)
);

CREATE TABLE application_versions (
    id uuid PRIMARY KEY,
    application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
    number integer NOT NULL CHECK (number > 0),
    source_digest varchar(71) NOT NULL CHECK (source_digest ~ '^sha256:[a-f0-9]{64}$'),
    status varchar(16) NOT NULL CHECK (status IN ('DRAFT', 'VERIFIED', 'FAILED')),
    build_id uuid,
    row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT application_versions_number_key UNIQUE (application_id, number),
    CONSTRAINT application_versions_application_id_id_key UNIQUE (application_id, id),
    CONSTRAINT application_versions_verified_build_check CHECK (status <> 'VERIFIED' OR build_id IS NOT NULL)
);
ALTER TABLE applications ADD CONSTRAINT applications_latest_ready_version_fk
    FOREIGN KEY (id, latest_ready_version_id)
    REFERENCES application_versions(application_id, id) ON DELETE RESTRICT;

CREATE TABLE builds (
    id uuid PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES generation_tasks(id) ON DELETE RESTRICT,
    version_id uuid NOT NULL REFERENCES application_versions(id) ON DELETE RESTRICT,
    status varchar(16) NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    exit_code integer CHECK (exit_code >= 0),
    artifact_digest varchar(71) CHECK (artifact_digest ~ '^sha256:[a-f0-9]{64}$'),
    log_url text,
    row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT builds_result_check CHECK (
        (status IN ('QUEUED', 'RUNNING') AND exit_code IS NULL AND completed_at IS NULL) OR
        (status = 'SUCCEEDED' AND exit_code = 0 AND artifact_digest IS NOT NULL AND completed_at IS NOT NULL) OR
        (status = 'FAILED' AND exit_code > 0 AND completed_at IS NOT NULL)
    )
);
ALTER TABLE application_versions ADD CONSTRAINT application_versions_build_fk
    FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE RESTRICT;
CREATE INDEX builds_task_id_idx ON builds(task_id);
CREATE INDEX builds_version_id_idx ON builds(version_id);

CREATE TABLE publications (
    id uuid PRIMARY KEY,
    application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
    version_id uuid NOT NULL,
    requested_by uuid NOT NULL REFERENCES platform_users(id) ON DELETE RESTRICT,
    status varchar(16) NOT NULL CHECK (status IN ('REQUESTED', 'PUBLISHED', 'FAILED')),
    url text,
    row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    CONSTRAINT publications_version_fk FOREIGN KEY (application_id, version_id)
        REFERENCES application_versions(application_id, id) ON DELETE RESTRICT,
    CONSTRAINT publications_published_check CHECK (
        status <> 'PUBLISHED' OR
        (url ~ '^https://[^[:space:]]+$' AND published_at IS NOT NULL)
    )
);
CREATE INDEX publications_application_id_idx ON publications(application_id);

CREATE TABLE model_calls (
    id uuid PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES generation_tasks(id) ON DELETE RESTRICT,
    stage varchar(16) NOT NULL CHECK (stage IN ('PLAN', 'GENERATE', 'REPAIR')),
    provider varchar(80) NOT NULL CHECK (length(btrim(provider)) > 0),
    model varchar(120) NOT NULL CHECK (length(btrim(model)) > 0),
    status varchar(16) NOT NULL CHECK (status IN ('REQUESTED', 'SUCCEEDED', 'FAILED')),
    input_tokens integer CHECK (input_tokens >= 0),
    output_tokens integer CHECK (output_tokens >= 0),
    error_code varchar(100),
    row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT model_calls_result_check CHECK (
        (status = 'REQUESTED' AND completed_at IS NULL AND error_code IS NULL) OR
        (status = 'SUCCEEDED' AND completed_at IS NOT NULL AND error_code IS NULL) OR
        (status = 'FAILED' AND completed_at IS NOT NULL AND error_code IS NOT NULL)
    )
);
CREATE INDEX model_calls_task_id_idx ON model_calls(task_id);

CREATE FUNCTION prevent_version_identity_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.application_id IS DISTINCT FROM OLD.application_id OR
       NEW.number IS DISTINCT FROM OLD.number OR
       NEW.source_digest IS DISTINCT FROM OLD.source_digest THEN
        RAISE EXCEPTION 'application version identity and source digest are immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.status IN ('VERIFIED', 'FAILED') AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'a finalized application version cannot change status' USING ERRCODE = '23514';
    END IF;
    IF OLD.status IN ('VERIFIED', 'FAILED') AND NEW.build_id IS DISTINCT FROM OLD.build_id THEN
        RAISE EXCEPTION 'a finalized application version cannot change build' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'VERIFIED' AND OLD.status <> 'VERIFIED' AND NOT EXISTS (
        SELECT 1 FROM builds b JOIN generation_tasks t ON t.id = b.task_id
        WHERE b.id = NEW.build_id AND b.version_id = NEW.id
          AND t.application_id = NEW.application_id
          AND b.status = 'SUCCEEDED' AND b.exit_code = 0
    ) THEN
        RAISE EXCEPTION 'verification requires a successful build of this version' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER application_version_identity_immutable
    BEFORE UPDATE ON application_versions
    FOR EACH ROW EXECUTE FUNCTION prevent_version_identity_change();

CREATE FUNCTION check_latest_ready_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.latest_ready_version_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM application_versions v
        WHERE v.id = NEW.latest_ready_version_id AND v.application_id = NEW.id
          AND v.status = 'VERIFIED'
    ) THEN
        RAISE EXCEPTION 'latest ready version must be verified and belong to this application' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER application_latest_ready_guard
    BEFORE INSERT OR UPDATE OF latest_ready_version_id ON applications
    FOR EACH ROW EXECUTE FUNCTION check_latest_ready_version();

CREATE FUNCTION protect_build_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.task_id IS DISTINCT FROM OLD.task_id OR NEW.version_id IS DISTINCT FROM OLD.version_id THEN
        RAISE EXCEPTION 'build task and version are immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.status IN ('SUCCEEDED', 'FAILED') AND (
        NEW.status IS DISTINCT FROM OLD.status OR NEW.exit_code IS DISTINCT FROM OLD.exit_code OR
        NEW.artifact_digest IS DISTINCT FROM OLD.artifact_digest OR
        NEW.completed_at IS DISTINCT FROM OLD.completed_at
    ) THEN
        RAISE EXCEPTION 'a completed build result is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER build_result_guard
    BEFORE UPDATE ON builds FOR EACH ROW EXECUTE FUNCTION protect_build_result();

CREATE FUNCTION check_publication_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.application_id IS DISTINCT FROM OLD.application_id OR
        NEW.version_id IS DISTINCT FROM OLD.version_id OR
        NEW.requested_by IS DISTINCT FROM OLD.requested_by OR
        (OLD.status IN ('PUBLISHED', 'FAILED') AND NEW.status IS DISTINCT FROM OLD.status)
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
CREATE TRIGGER publication_request_guard
    BEFORE INSERT OR UPDATE ON publications
    FOR EACH ROW EXECUTE FUNCTION check_publication_request();
