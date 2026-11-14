-- Additive microservice schema; does not alter the main application's tables.
CREATE SCHEMA IF NOT EXISTS holdline_intake;
CREATE TABLE IF NOT EXISTS holdline_intake.profiles (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  version integer NOT NULL CHECK (version >= 0),
  quiz_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  state jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS intake_profiles_expiry ON holdline_intake.profiles (expires_at);
CREATE TABLE IF NOT EXISTS holdline_intake.control_records (
  key text PRIMARY KEY,
  version integer NOT NULL CHECK (version >= 0),
  data jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS intake_control_expiry ON holdline_intake.control_records (expires_at);
CREATE TABLE IF NOT EXISTS holdline_intake.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO holdline_intake.feature_flags (key, enabled)
VALUES ('avatar_intake', false), ('visual_intake', false), ('pitch_analysis', false)
ON CONFLICT (key) DO NOTHING;
