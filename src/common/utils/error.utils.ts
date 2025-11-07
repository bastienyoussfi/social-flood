/**
 * Safely extracts an error message from an unknown error
 * @param error - The error to extract a message from
 * @returns A safe error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  return 'An unknown error occurred';
}

/**
 * Safely extracts an error stack trace from an unknown error
 * @param error - The error to extract a stack from
 * @returns A safe error stack string or undefined
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }

  if (error && typeof error === 'object' && 'stack' in error) {
    return String(error.stack);
  }

  return undefined;
}

/**
 * Formats an error for logging purposes
 * @param error - The error to format
 * @returns An object with message and optional stack
 */
export function formatError(error: unknown): {
  message: string;
  stack?: string;
} {
  return {
    message: getErrorMessage(error),
    stack: getErrorStack(error),
  };
}
