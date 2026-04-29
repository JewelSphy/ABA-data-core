INSERT INTO sessions (
  id, org_id, client_id, staff_id, service_type,
  session_date, start_time, end_time, status, pos, procedure_code, notes
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
