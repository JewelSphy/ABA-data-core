-- Run once on existing databases created before newer document columns existed.
-- Safe to re-run: if a column already exists, remove that line or run statements one at a time.

ALTER TABLE documents ADD COLUMN client_id VARCHAR(36) NULL;
ALTER TABLE documents ADD COLUMN requirement_key VARCHAR(80) NULL;
ALTER TABLE documents ADD INDEX idx_documents_client (client_id);

ALTER TABLE documents ADD COLUMN attachment_mime VARCHAR(120) NULL;
ALTER TABLE documents ADD COLUMN attachment_filename VARCHAR(255) NULL;
ALTER TABLE documents ADD COLUMN attachment_base64 LONGTEXT NULL;
ALTER TABLE documents ADD COLUMN content_text LONGTEXT NULL;
