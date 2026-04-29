# Gilberto CRM Java Backend

Organized Java backend that matches the frontend bridge routes and uses MySQL.

## Run

1. Create MySQL database: `CREATE DATABASE gilberto_crm;`
2. (Optional) set env vars:
   - `DB_URL=jdbc:mysql://localhost:3306/gilberto_crm`
   - `DB_USER=root`
   - `DB_PASS=root`
   - `PORT=8788`
   - `MAX_BODY_BYTES=131072`
   - `ALLOWED_ORIGIN=http://127.0.0.1:5500` (recommended in production)
   - `API_KEY=<long-random-secret>` (recommended in production)
3. Start backend:
   - `./run-backend.sh`

## Java structure

- `gilberto/Main.java`
- `gilberto/Db.java`
- `gilberto/HttpUtil.java`
- `gilberto/JsonUtil.java`
- `gilberto/QueryUtil.java`
- `gilberto/handlers/*.java`

## SQL structure

- `sql/schema/001_init.sql`
- `sql/clients/select.sql`
- `sql/clients/insert.sql`
- `sql/clients/update.sql`
- `sql/sessions/select.sql`
- `sql/sessions/insert.sql`
- `sql/sessions/update.sql`

## API routes (frontend bridge compatible)

- `GET /health`
- `GET|POST|PATCH|DELETE /api/clients`
- `GET|POST|PATCH|DELETE /api/staff`
- `GET|POST|PATCH|DELETE /api/sessions`
- `GET|POST /api/session-notes`
- `POST /api/ai/session-note`
- `GET|POST /api/caregivers`
- `GET /api/client-stats?org_id=...`
- `GET /api/dashboard-stats?org_id=...&today=...&week_start=...&week_end=...`

## Security hardening included

- Optional API-key auth (`x-api-key`, `apikey`, or `Authorization: Bearer ...`) when `API_KEY` is set.
- Configurable origin allow-list (`ALLOWED_ORIGIN`).
- Request body size limit (`MAX_BODY_BYTES`).
- Security headers on JSON responses (`nosniff`, frame deny, no-store cache).
- Basic audit log table (`audit_logs`) for auth failures and write actions.

### Filter style supported

- `?id=eq.<id>`
- `?org_id=eq.<orgId>`
- `?status=eq.<status>`
- sessions date range:
  - `?session_date=gte.<yyyy-mm-dd>`
  - `?session_date=lte.<yyyy-mm-dd>`
