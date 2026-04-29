INSERT INTO user_profiles (
  id, org_id, user_key, full_name, email, role_title, phone, bio, avatar_initial
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  email = VALUES(email),
  role_title = VALUES(role_title),
  phone = VALUES(phone),
  bio = VALUES(bio),
  avatar_initial = VALUES(avatar_initial),
  updated_at = CURRENT_TIMESTAMP
