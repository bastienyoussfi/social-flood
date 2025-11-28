import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { LinkedInApiClient } from './linkedin-api.client';
import { MediaAttachment } from '../../common/interfaces';
import {
  LinkedInImageUploadInit,
  LinkedInImageInitDto,
  LINKEDIN_API_VERSION,
  LINKEDIN_PROTOCOL_VERSION,
} from './interfaces';
import { getErrorMessage, getErrorStack } from '../../common/utils/error.utils';
import { LinkedInOAuthService } from './linkedin-oauth.service';

/**
 * LinkedIn Media Service
 * Handles downloading media from URLs and uploading to LinkedIn
 * Supports images (up to 20 per post)
 * Works with both env-based credentials and OAuth user tokens
 */
@Injectable()
export class LinkedInMediaService {
  private readonly logger = new Logger(LinkedInMediaService.name);
  private readonly MAX_IMAGES = 20;
  private readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

  // Supported image MIME types
  private readonly SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
  ];

  constructor(
    @Inject(forwardRef(() => LinkedInApiClient))
    private readonly apiClient: LinkedInApiClient,
    @Inject(forwardRef(() => LinkedInOAuthService))
    private readonly oauthService: LinkedInOAuthService,
  ) {}

  /**
   * Upload media attachments to LinkedIn using env-based credentials
   * @param media - Array of media attachments with URLs
   * @returns Array of LinkedIn media URNs
   */
  async uploadMedia(media: MediaAttachment[]): Promise<string[]> {
    const accessToken = this.apiClient.getAccessToken();
    const personUrn = this.apiClient.getPersonUrn();

    if (!accessToken) {
      throw new Error('Access token is not configured');
    }

    if (!personUrn) {
      throw new Error('Person URN is not configured');
    }

    return this.executeUploadMedia(media, accessToken, personUrn);
  }

  /**
   * Upload media attachments to LinkedIn using OAuth user tokens
   * @param userId - User identifier
   * @param media - Array of media attachments with URLs
   * @returns Array of LinkedIn media URNs
   */
  async uploadMediaForUser(
    userId: string,
    media: MediaAttachment[],
  ): Promise<string[]> {
    const accessToken = await this.oauthService.getAccessToken(userId);
    if (!accessToken) {
      throw new Error(
        `No valid LinkedIn access token found for user ${userId}. Please authenticate first.`,
      );
    }

    const personUrn = await this.oauthService.getPersonUrn(userId);
    if (!personUrn) {
      throw new Error(
        `No LinkedIn person URN found for user ${userId}. Please re-authenticate.`,
      );
    }

    return this.executeUploadMedia(media, accessToken, personUrn);
  }

  /**
   * Execute media upload with provided credentials
   * @param media - Array of media attachments with URLs
   * @param accessToken - OAuth access token
   * @param personUrn - LinkedIn person URN
   * @returns Array of LinkedIn media URNs
   */
  private async executeUploadMedia(
    media: MediaAttachment[],
    accessToken: string,
    personUrn: string,
  ): Promise<string[]> {
    if (!media || media.length === 0) {
      return [];
    }

    // Validate media count
    if (media.length > this.MAX_IMAGES) {
      throw new Error(
        `LinkedIn supports maximum ${this.MAX_IMAGES} images per post. Provided: ${media.length}`,
      );
    }

    this.logger.log(`Uploading ${media.length} media item(s) to LinkedIn`);

    const mediaUrns: string[] = [];

    for (let i = 0; i < media.length; i++) {
      const attachment = media[i];

      try {
        this.logger.log(
          `Uploading media ${i + 1}/${media.length}: ${attachment.url}`,
        );

        // For now, we only support images
        if (attachment.type !== 'image') {
          this.logger.warn(
            `Skipping unsupported media type: ${attachment.type}`,
          );
          continue;
        }

        // Upload single image
        const mediaUrn = await this.uploadSingleImageWithCredentials(
          attachment,
          accessToken,
          personUrn,
        );
        mediaUrns.push(mediaUrn);

        this.logger.log(`Media ${i + 1} uploaded successfully: ${mediaUrn}`);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        const errorStack = getErrorStack(error);

        this.logger.error(
          `Failed to upload media ${i + 1}: ${errorMessage}`,
          errorStack,
        );
        // Continue with other media items
        // You might want to throw here depending on your requirements
      }
    }

    if (mediaUrns.length === 0 && media.length > 0) {
      throw new Error('Failed to upload any media attachments');
    }

    this.logger.log(`Successfully uploaded ${mediaUrns.length} media item(s)`);
    return mediaUrns;
  }

  /**
   * Upload a single image to LinkedIn with specific credentials
   * Process: Initialize upload -> Download image -> Upload binary
   * @param attachment - Media attachment with URL
   * @param accessToken - OAuth access token
   * @param personUrn - LinkedIn person URN
   * @returns LinkedIn media URN
   */
  private async uploadSingleImageWithCredentials(
    attachment: MediaAttachment,
    accessToken: string,
    personUrn: string,
  ): Promise<string> {
    try {
      // Step 1: Initialize the upload
      const uploadInit = await this.initializeImageUploadWithCredentials(
        accessToken,
        personUrn,
      );
      const { uploadUrl, image: imageUrn } = uploadInit.value;

      this.logger.log(`Initialized upload. Image URN: ${imageUrn}`);

      // Step 2: Download image from URL
      const imageBuffer = await this.downloadMedia(attachment.url);

      // Validate image size
      if (imageBuffer.length > this.MAX_IMAGE_SIZE) {
        throw new Error(
          `Image exceeds maximum size of ${this.MAX_IMAGE_SIZE / 1024 / 1024}MB`,
        );
      }

      // Step 3: Upload the image binary to LinkedIn
      await this.uploadImageBinaryWithCredentials(
        uploadUrl,
        imageBuffer,
        accessToken,
      );

      this.logger.log(`Image uploaded successfully: ${imageUrn}`);

      return imageUrn;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(`Failed to upload image: ${errorMessage}`, errorStack);
      throw new Error(`Image upload failed: ${errorMessage}`);
    }
  }

  /**
   * Initialize image upload with LinkedIn using specific credentials
   * @param accessToken - OAuth access token
   * @param personUrn - LinkedIn person URN
   * @returns Upload URL and image URN
   */
  private async initializeImageUploadWithCredentials(
    accessToken: string,
    personUrn: string,
  ): Promise<LinkedInImageUploadInit> {
    try {
      const initDto: LinkedInImageInitDto = {
        initializeUploadRequest: {
          owner: personUrn,
        },
      };

      const baseUrl = this.apiClient.getBaseUrl();
      const response = await fetch(
        `${baseUrl}/rest/images?action=initializeUpload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'LinkedIn-Version': LINKEDIN_API_VERSION,
            'X-Restli-Protocol-Version': LINKEDIN_PROTOCOL_VERSION,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(initDto),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to initialize image upload: ${response.status} ${errorText}`,
        );
      }

      const result = (await response.json()) as LinkedInImageUploadInit;

      if (!result.value?.uploadUrl || !result.value?.image) {
        throw new Error('Invalid response from LinkedIn image initialization');
      }

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to initialize image upload: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Image upload initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Upload image binary to LinkedIn's upload URL with specific credentials
   * @param uploadUrl - Pre-signed upload URL from initialization
   * @param imageBuffer - Image binary data
   * @param accessToken - OAuth access token
   */
  private async uploadImageBinaryWithCredentials(
    uploadUrl: string,
    imageBuffer: Buffer,
    accessToken: string,
  ): Promise<void> {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: imageBuffer as unknown as BodyInit,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to upload image binary: ${response.status} ${errorText}`,
        );
      }

      this.logger.log('Image binary uploaded successfully');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to upload image binary: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Image binary upload failed: ${errorMessage}`);
    }
  }

  /**
   * Download media from URL
   * @param url - Media URL
   * @returns Buffer containing media data
   */
  private async downloadMedia(url: string): Promise<Buffer> {
    try {
      this.logger.log(`Downloading media from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Validate content type
      const contentType = response.headers.get('content-type');
      if (contentType && !this.SUPPORTED_IMAGE_TYPES.includes(contentType)) {
        this.logger.warn(
          `Potentially unsupported image type: ${contentType}. Proceeding anyway.`,
        );
      }

      // Convert to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      this.logger.log(`Downloaded ${buffer.length} bytes`);

      return buffer;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorStack = getErrorStack(error);

      this.logger.error(
        `Failed to download media: ${errorMessage}`,
        errorStack,
      );
      throw new Error(`Media download failed: ${errorMessage}`);
    }
  }

  /**
   * Validate media attachments before processing
   * @param media - Array of media attachments
   * @returns Validation result
   */
  validateMedia(media: MediaAttachment[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!media || media.length === 0) {
      return { valid: true, errors: [] };
    }

    // Check count
    if (media.length > this.MAX_IMAGES) {
      errors.push(
        `Too many images. LinkedIn supports maximum ${this.MAX_IMAGES} images per post.`,
      );
    }

    // Check each attachment
    media.forEach((attachment, index) => {
      if (!attachment.url) {
        errors.push(`Media item ${index + 1} is missing URL`);
      }

      if (attachment.type !== 'image') {
        errors.push(
          `Media item ${index + 1} has unsupported type: ${attachment.type}. Only images are supported currently.`,
        );
      }

      // Validate URL format
      try {
        new URL(attachment.url);
      } catch {
        errors.push(
          `Media item ${index + 1} has invalid URL: ${attachment.url}`,
        );
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
