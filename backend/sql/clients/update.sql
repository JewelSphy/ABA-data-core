UPDATE clients
SET
  first_name = COALESCE(?, first_name),
  last_name = COALESCE(?, last_name),
  date_of_birth = COALESCE(?, date_of_birth),
  diagnosis = COALESCE(?, diagnosis),
  assigned_rbt_id = COALESCE(?, assigned_rbt_id),
  assigned_bcba_id = COALESCE(?, assigned_bcba_id),
  insurance_provider = COALESCE(?, insurance_provider),
  email = COALESCE(?, email),
  phone = COALESCE(?, phone),
  auth_status = COALESCE(?, auth_status),
  notes = COALESCE(?, notes),
  status = COALESCE(?, status)
WHERE id = ?
