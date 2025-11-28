-- Migration: Cleanup legacy tables and migrate to social_connections
-- Run this migration manually before deploying the new schema

-- 1. Drop legacy tiktok_auth table if it exists
DROP TABLE IF EXISTS tiktok_auth CASCADE;

-- 2. Migrate data from oauth_tokens to social_connections (if oauth_tokens exists)
-- First, create the new table structure
CREATE TABLE IF NOT EXISTS social_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    platform VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    refresh_expires_at TIMESTAMP,
    scopes TEXT,
    platform_user_id VARCHAR(255),
    platform_username VARCHAR(255),
    metadata JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_social_connections_user_id ON social_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_platform ON social_connections(platform);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_connections_unique 
    ON social_connections(user_id, platform, platform_user_id);

-- 4. Migrate existing data from oauth_tokens if table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'oauth_tokens') THEN
        INSERT INTO social_connections (
            id, user_id, platform, display_name, access_token, refresh_token,
            expires_at, refresh_expires_at, scopes, platform_user_id, 
            platform_username, metadata, is_active, created_at, updated_at
        )
        SELECT 
            id, user_id, platform, platform_username as display_name, access_token, refresh_token,
            expires_at, refresh_expires_at, scopes, platform_user_id,
            platform_username, metadata::jsonb, "isActive", created_at, updated_at
        FROM oauth_tokens
        ON CONFLICT (user_id, platform, platform_user_id) DO NOTHING;
        
        -- Drop old table after migration
        DROP TABLE oauth_tokens CASCADE;
    END IF;
END $$;

-- 5. Add comment to table
COMMENT ON TABLE social_connections IS 'Stores OAuth tokens for social media platform connections. Supports multiple accounts per platform per user.';

