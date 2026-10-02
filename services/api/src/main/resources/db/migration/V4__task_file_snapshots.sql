CREATE TABLE task_file_snapshots (
    task_id uuid PRIMARY KEY REFERENCES generation_tasks(id) ON DELETE RESTRICT,
    revision integer NOT NULL CHECK (revision > 0),
    changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) <= 40),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
