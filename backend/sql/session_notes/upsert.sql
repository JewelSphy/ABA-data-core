INSERT INTO session_notes (
  id, session_id, org_id, progress_note, similarity_percent, supervision_required,
  rbt_signed_by, rbt_signed_at, supervisor_signed_by, supervisor_signed_at,
  submitted_by, submitted_at, status
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  org_id = VALUES(org_id),
  progress_note = VALUES(progress_note),
  similarity_percent = VALUES(similarity_percent),
  supervision_required = VALUES(supervision_required),
  rbt_signed_by = VALUES(rbt_signed_by),
  rbt_signed_at = VALUES(rbt_signed_at),
  supervisor_signed_by = VALUES(supervisor_signed_by),
  supervisor_signed_at = VALUES(supervisor_signed_at),
  submitted_by = VALUES(submitted_by),
  submitted_at = VALUES(submitted_at),
  status = VALUES(status)
