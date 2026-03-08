-- ================================================
-- Sonnet Chat - PostgreSQL Schema
-- ================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username VARCHAR(20) NOT NULL,
    profile_pic TEXT DEFAULT '/uploads/profiles/default-profile.jpg',
    about VARCHAR(140) DEFAULT 'Hey there! I am using ClassChat',
    push_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-seed the public room
INSERT INTO rooms (id) VALUES ('public') ON CONFLICT (id) DO NOTHING;

-- Room members (tracks which user is in which room)
CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY,
    room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    recipient_id TEXT,
    type VARCHAR(10) NOT NULL CHECK (type IN ('group', 'private')),
    kind VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'file')),
    text TEXT,
    status VARCHAR(15) DEFAULT 'sent',
    timestamp BIGINT NOT NULL,
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    reactions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast message lookups by room
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, timestamp DESC);

-- Index for fast private message lookups
CREATE INDEX IF NOT EXISTS idx_messages_private ON messages(sender_id, recipient_id, timestamp DESC);

-- File metadata table (only metadata, not the file itself)
CREATE TABLE IF NOT EXISTS file_metadata (
    id SERIAL PRIMARY KEY,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    mimetype VARCHAR(100),
    size BIGINT
);

-- Migrations (Safe to run multiple times)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;
