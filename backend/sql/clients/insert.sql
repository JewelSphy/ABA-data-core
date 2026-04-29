INSERT INTO clients (
  id, org_id, first_name, last_name, date_of_birth, diagnosis,
  assigned_rbt_id, assigned_bcba_id, insurance_provider,
  email, phone, auth_status, notes, status
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
