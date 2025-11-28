import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Social Connection Entity
 * Stores OAuth 2.0 tokens for social media platform connections
 * Supports multiple accounts per platform per user
 */
@Entity('social_connections')
@Index(['userId', 'platform', 'platformUserId'], { unique: true })
export class SocialConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * User ID from better-auth user table
   */
  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  /**
   * Platform name (linkedin, twitter, tiktok, pinterest, instagram, bluesky)
   */
  @Column()
  @Index()
  platform: string;

  /**
   * User-friendly display name for this connection
   * e.g., "@johndoe" or "John Doe - Personal"
   */
  @Column({ type: 'varchar', name: 'display_name', nullable: true })
  displayName: string | null;

  /**
   * OAuth access token
   */
  @Column('text', { name: 'access_token' })
  accessToken: string;

  /**
   * OAuth refresh token (if available)
   */
  @Column('text', { name: 'refresh_token', nullable: true })
  refreshToken: string | null;

  /**
   * Token expiration timestamp
   */
  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  /**
   * Refresh token expiration timestamp (for platforms like TikTok)
   */
  @Column({ name: 'refresh_expires_at', type: 'timestamp', nullable: true })
  refreshExpiresAt: Date | null;

  /**
   * OAuth scopes granted
   */
  @Column('simple-array', { nullable: true })
  scopes: string[];

  /**
   * Platform-specific user ID or account ID
   * (e.g., Pinterest user ID, TikTok open ID)
   */
  @Column({ type: 'varchar', name: 'platform_user_id', nullable: true })
  platformUserId: string | null;

  /**
   * Platform-specific username
   */
  @Column({ type: 'varchar', name: 'platform_username', nullable: true })
  platformUsername: string | null;

  /**
   * Additional metadata (JSON)
   */
  @Column('simple-json', { nullable: true })
  metadata: Record<string, unknown> | null;

  /**
   * Whether this connection is currently active
   */
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Check if the token is expired
   */
  isExpired(): boolean {
    if (!this.expiresAt) {
      return false;
    }
    return new Date() > this.expiresAt;
  }

  /**
   * Check if token needs refresh (expires in less than 5 minutes)
   */
  needsRefresh(): boolean {
    if (!this.expiresAt) {
      return false;
    }
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return this.expiresAt < fiveMinutesFromNow;
  }

  /**
   * Check if refresh token is expired (for platforms like TikTok)
   */
  isRefreshTokenExpired(): boolean {
    if (!this.refreshExpiresAt) {
      return false;
    }
    return new Date() > this.refreshExpiresAt;
  }
}
