-- Migration: Add is_admin column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Set Tinashe as admin
UPDATE users SET is_admin = true WHERE username = 'Tinashe';
