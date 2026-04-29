UPDATE sessions
SET
  service_type = COALESCE(?, service_type),
  session_date = COALESCE(?, session_date),
  start_time = COALESCE(?, start_time),
  end_time = COALESCE(?, end_time),
  status = COALESCE(?, status),
  pos = COALESCE(?, pos),
  procedure_code = COALESCE(?, procedure_code),
  notes = COALESCE(?, notes)
WHERE id = ?
