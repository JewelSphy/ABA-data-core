SELECT
  c.id,
  c.org_id,
  c.first_name,
  c.last_name,
  c.date_of_birth,
  c.diagnosis,
  c.assigned_rbt_id,
  c.assigned_bcba_id,
  c.insurance_provider,
  c.email,
  c.phone,
  c.auth_status,
  c.notes,
  c.status
FROM clients c
