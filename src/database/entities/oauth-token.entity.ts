import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * OAuth Token Entity
 * Stores OAuth 2.0 access tokens and refresh tokens for multiple users and platforms
 * Supports Pinterest, TikTok, LinkedIn, and other OAuth-based platforms
 */
@Entity('oauth_tokens')
@Index(['userId', 'platform'], { unique: true })
export class OAuthToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * User identifier (can be email, username, or any unique user ID)
   * For multi-user applications
   */
  @Column({ name: 'user_id' })
  userId: string;

  /**
   * Platform name (pinterest, tiktok, linkedin, etc.)
   */
  @Column()
  @Index()
  platform: string;

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
   * OAuth scopes granted
   */
  @Column('simple-array', { nullable: true })
  scopes: string[];

  /**
   * Platform-specific user ID or account ID
   * (e.g., Pinterest user ID, TikTok open ID)
   */
  @Column({ name: 'platform_user_id', nullable: true })
  platformUserId: string | null;

  /**
   * Platform-specific username or display name
   */
  @Column({ name: 'platform_username', nullable: true })
  platformUsername: string | null;

  /**
   * Additional metadata (JSON)
   */
  @Column('simple-json', { nullable: true })
  metadata: Record<string, any> | null;

  /**
   * Whether this token is currently active
   */
  @Column({ default: true })
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
}
