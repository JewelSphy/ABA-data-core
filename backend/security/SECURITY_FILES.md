# Security Files Map

This folder groups files that are directly related to backend security hardening.

## Java security files

Path: `backend/security/java securirty files/`

- `Env.java` - security env config (`API_KEY`, `ALLOWED_ORIGIN`, `MAX_BODY_BYTES`).
- `HttpUtil.java` - CORS checks, API-key guard, request-size limit, security headers.
- `Audit.java` - audit log writer for security-relevant events.

## Security-related SQL

- `backend/sql/schema/001_init.sql` (contains `audit_logs` table).

## Security-related runtime config

- `backend/run-backend.sh` (documents secure env vars).
