import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TikTok Authentication Entity
 * Stores OAuth 2.0 tokens for TikTok users
 */
@Entity('tiktok_auth')
export class TikTokAuth {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tiktok_user_id', unique: true })
  tiktokUserId: string;

  @Column({ name: 'tiktok_username', nullable: true })
  tiktokUsername: string | null;

  @Column({ name: 'access_token' })
  accessToken: string;

  @Column({ name: 'refresh_token' })
  refreshToken: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'refresh_expires_at', type: 'timestamp' })
  refreshExpiresAt: Date;

  @Column({ type: 'json', nullable: true })
  scopes: string[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Check if access token is expired or about to expire (within 5 minutes)
   */
  isAccessTokenExpired(): boolean {
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    return now.getTime() + bufferTime >= this.expiresAt.getTime();
  }

  /**
   * Check if refresh token is expired
   */
  isRefreshTokenExpired(): boolean {
    const now = new Date();
    return now.getTime() >= this.refreshExpiresAt.getTime();
  }
}
