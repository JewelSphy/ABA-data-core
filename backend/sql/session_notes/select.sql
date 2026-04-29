SELECT
  n.id,
  n.session_id,
  n.org_id,
  n.progress_note,
  n.similarity_percent,
  n.supervision_required,
  n.rbt_signed_by,
  n.rbt_signed_at,
  n.supervisor_signed_by,
  n.supervisor_signed_at,
  n.submitted_by,
  n.submitted_at,
  n.status,
  n.updated_at,
  s.session_date,
  s.service_type,
  c.first_name AS client_first_name,
  c.last_name AS client_last_name
FROM session_notes n
LEFT JOIN sessions s ON s.id = n.session_id
LEFT JOIN clients c ON c.id = s.client_id
