-- Postgres image runs this on first init (empty data dir).
-- The default `touchline` database is created automatically from the
-- POSTGRES_DB env var; this script adds the side database that
-- identity-service owns.
--
-- Both databases live in the same postgres instance and are owned by
-- the same role for operational simplicity. Logical isolation comes from
-- the database boundary itself.

CREATE DATABASE identity_service;
GRANT ALL PRIVILEGES ON DATABASE identity_service TO touchline;
