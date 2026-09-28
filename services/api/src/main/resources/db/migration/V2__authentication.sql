CREATE TABLE auth_credentials (
    user_id uuid PRIMARY KEY REFERENCES platform_users(id) ON DELETE CASCADE,
    password_hash varchar(100) NOT NULL,
    role varchar(16) NOT NULL CHECK (role IN ('USER', 'ADMIN')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT auth_credentials_bcrypt CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$')
);
