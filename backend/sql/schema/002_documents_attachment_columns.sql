-- Run once on existing databases that lack attachment columns.
ALTER TABLE documents
  ADD COLUMN attachment_mime VARCHAR(120) NULL,
  ADD COLUMN attachment_filename VARCHAR(255) NULL,
  ADD COLUMN attachment_base64 LONGTEXT NULL;
