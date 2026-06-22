-- 009: Add password reset tokens and writing style preference

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS writing_style        VARCHAR(50) DEFAULT 'professional';
