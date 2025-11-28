import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthStateData, OAuthPlatform } from '../interfaces';
import { randomBytes, createHash } from 'crypto';

/**
 * OAuth State Manager
 * Manages OAuth state parameters for CSRF protection and PKCE
 * Uses in-memory storage with configurable TTL
 *
 * For production with multiple instances, consider using Redis directly
 * via @nestjs-modules/ioredis or similar
 */
@Injectable()
export class OAuthStateManager implements OnModuleDestroy {
  private readonly logger = new Logger(OAuthStateManager.name);
  private readonly stateStore = new Map<string, OAuthStateData>();
  private readonly STATE_TTL_MS: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    // State expires after 10 minutes by default
    this.STATE_TTL_MS = this.configService.get<number>(
      'OAUTH_STATE_TTL_MS',
      10 * 60 * 1000,
    );

    // Clean up expired states every 5 minutes
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredStates(),
      5 * 60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Generate a new state parameter and store associated data
   */
  generateState(userId: string, platform: OAuthPlatform): string {
    const state = randomBytes(32).toString('hex');

    const stateData: OAuthStateData = {
      userId,
      platform,
      createdAt: new Date(),
    };

    this.stateStore.set(state, stateData);
    this.logger.debug(
      `Generated state for user ${userId} on ${platform}: ${state.substring(0, 8)}...`,
    );

    return state;
  }

  /**
   * Generate state with PKCE (for platforms like Twitter)
   */
  generateStateWithPKCE(
    userId: string,
    platform: OAuthPlatform,
  ): { state: string; codeVerifier: string; codeChallenge: string } {
    const state = randomBytes(32).toString('hex');

    // Generate PKCE code verifier (43-128 characters)
    const codeVerifier = randomBytes(32)
      .toString('base64url')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 128);

    // Generate code challenge using SHA256
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const stateData: OAuthStateData = {
      userId,
      platform,
      codeVerifier,
      codeChallenge,
      createdAt: new Date(),
    };

    this.stateStore.set(state, stateData);
    this.logger.debug(
      `Generated PKCE state for user ${userId} on ${platform}: ${state.substring(0, 8)}...`,
    );

    return { state, codeVerifier, codeChallenge };
  }

  /**
   * Validate and retrieve state data, then remove it (single use)
   */
  validateAndConsumeState(state: string): OAuthStateData | null {
    const stateData = this.stateStore.get(state);

    if (!stateData) {
      this.logger.warn(`State not found: ${state.substring(0, 8)}...`);
      return null;
    }

    // Check if state is expired
    const age = Date.now() - stateData.createdAt.getTime();
    if (age > this.STATE_TTL_MS) {
      this.logger.warn(`State expired: ${state.substring(0, 8)}...`);
      this.stateStore.delete(state);
      return null;
    }

    // Remove state after validation (single use)
    this.stateStore.delete(state);

    this.logger.debug(
      `Validated and consumed state for user ${stateData.userId} on ${stateData.platform}`,
    );

    return stateData;
  }

  /**
   * Peek at state data without consuming it
   */
  peekState(state: string): OAuthStateData | null {
    const stateData = this.stateStore.get(state);

    if (!stateData) {
      return null;
    }

    // Check if state is expired
    const age = Date.now() - stateData.createdAt.getTime();
    if (age > this.STATE_TTL_MS) {
      this.stateStore.delete(state);
      return null;
    }

    return stateData;
  }

  /**
   * Remove a specific state
   */
  removeState(state: string): void {
    this.stateStore.delete(state);
  }

  /**
   * Clean up expired states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [state, data] of this.stateStore.entries()) {
      if (now - data.createdAt.getTime() > this.STATE_TTL_MS) {
        this.stateStore.delete(state);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired OAuth states`);
    }
  }

  /**
   * Get current state count (for monitoring)
   */
  getStateCount(): number {
    return this.stateStore.size;
  }
}
