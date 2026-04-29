CREATE TABLE IF NOT EXISTS clients (
  id VARCHAR(36) PRIMARY KEY,
  org_id VARCHAR(64),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NULL,
  diagnosis TEXT NULL,
  assigned_rbt_id VARCHAR(36) NULL,
  assigned_bcba_id VARCHAR(36) NULL,
  insurance_provider VARCHAR(120) NULL,
  email VARCHAR(150) NULL,
  phone VARCHAR(40) NULL,
  auth_status VARCHAR(32) NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR(36) PRIMARY KEY,
  org_id VARCHAR(64),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(64) NULL,
  email VARCHAR(150) NULL,
  phone VARCHAR(40) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caregivers (
  id VARCHAR(36) PRIMARY KEY,
  org_id VARCHAR(64),
  client_id VARCHAR(36) NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  relationship VARCHAR(100) NULL,
  email VARCHAR(150) NULL,
  phone VARCHAR(40) NULL,
  notes TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(36) PRIMARY KEY,
  org_id VARCHAR(64),
  client_id VARCHAR(36) NULL,
  staff_id VARCHAR(36) NULL,
  service_type VARCHAR(120) NULL,
  session_date DATE NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  pos VARCHAR(32) NULL,
  procedure_code VARCHAR(32) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_org_date (org_id, session_date),
  INDEX idx_sessions_client (client_id),
  INDEX idx_sessions_staff (staff_id)
);

CREATE TABLE IF NOT EXISTS session_notes (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  org_id VARCHAR(64) NULL,
  progress_note TEXT NULL,
  similarity_percent INT NULL,
  supervision_required TINYINT(1) NOT NULL DEFAULT 0,
  rbt_signed_by VARCHAR(150) NULL,
  rbt_signed_at TIMESTAMP NULL,
  supervisor_signed_by VARCHAR(150) NULL,
  supervisor_signed_at TIMESTAMP NULL,
  submitted_by VARCHAR(150) NULL,
  submitted_at TIMESTAMP NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_session_notes_session_id (session_id),
  INDEX idx_session_notes_org (org_id),
  INDEX idx_session_notes_status (status)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  actor VARCHAR(150) NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  outcome VARCHAR(32) NOT NULL,
  ip_address VARCHAR(80) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_actor_time (actor, created_at),
  INDEX idx_audit_entity_time (entity_type, entity_id, created_at)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id VARCHAR(36) PRIMARY KEY,
  org_id VARCHAR(36) NOT NULL,
  user_key VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  role_title VARCHAR(120) NULL,
  phone VARCHAR(50) NULL,
  bio TEXT NULL,
  avatar_initial VARCHAR(8) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_profiles_org_user (org_id, user_key),
  INDEX idx_user_profiles_org (org_id)
);

CREATE TABLE IF NOT EXISTS providers (
  id VARCHAR(36) PRIMARY KEY,
  org_id VARCHAR(64) NULL,
  full_name VARCHAR(180) NOT NULL,
  cert_type VARCHAR(80) NULL,
  cert_number VARCHAR(80) NULL,
  email VARCHAR(150) NULL,
  phone VARCHAR(40) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  authorization_info TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_providers_org (org_id),
  INDEX idx_providers_status (status)
);

CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(36) PRIMARY KEY,
  org_id VARCHAR(64) NULL,
  client_id VARCHAR(36) NULL,
  requirement_key VARCHAR(80) NULL,
  provider_id VARCHAR(36) NULL,
  doc_name VARCHAR(200) NOT NULL,
  doc_type VARCHAR(80) NULL,
  linked_name VARCHAR(180) NULL,
  upload_date DATE NULL,
  expiry_date DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  content_text LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_documents_org (org_id),
  INDEX idx_documents_provider (provider_id),
  INDEX idx_documents_status (status)
);
