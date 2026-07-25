-- The split tables live in the `app` schema, inherited from peanut-api-ts so
-- the lifted migrations apply unchanged. Nothing else creates it here.
CREATE SCHEMA IF NOT EXISTS "app";
