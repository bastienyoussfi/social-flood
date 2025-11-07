/**
 * Interface for job result containing platform post information
 */
export interface PlatformJobResult {
  platformPostId?: string;
  url?: string;
}

/**
 * Safely parses a job return value to extract platform post information
 * @param returnValue - The unknown return value from a Bull queue job
 * @returns Parsed job result or undefined if invalid
 */
export function parseJobReturnValue(
  returnValue: unknown,
): PlatformJobResult | undefined {
  if (!returnValue || typeof returnValue !== 'object') {
    return undefined;
  }

  const value = returnValue as Record<string, unknown>;

  return {
    platformPostId:
      typeof value.platformPostId === 'string'
        ? value.platformPostId
        : undefined,
    url: typeof value.url === 'string' ? value.url : undefined,
  };
}
