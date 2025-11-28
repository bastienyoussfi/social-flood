/**
 * LinkedIn OAuth 2.0 Configuration
 */
export interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  personUrn?: string; // urn:li:person:{id}
}

/**
 * LinkedIn OAuth 2.0 token response
 */
export interface LinkedInAuthToken {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
}

/**
 * LinkedIn user profile information
 */
export interface LinkedInProfile {
  id: string;
  localizedFirstName?: string;
  localizedLastName?: string;
}
