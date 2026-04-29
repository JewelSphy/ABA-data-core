SELECT
  s.id,
  s.org_id,
  s.client_id,
  s.staff_id,
  s.service_type,
  s.session_date,
  s.start_time,
  s.end_time,
  s.status,
  s.pos,
  s.procedure_code,
  s.notes,
  c.first_name AS client_first_name,
  c.last_name AS client_last_name,
  st.first_name AS staff_first_name,
  st.last_name AS staff_last_name
FROM sessions s
LEFT JOIN clients c ON c.id = s.client_id
LEFT JOIN staff st ON st.id = s.staff_id
