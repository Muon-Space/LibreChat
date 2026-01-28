import { logger } from '@librechat/data-schemas';
import type { TokenResponseMapping, MCPOAuthTokens } from './types';

/**
 * Retrieves a value from a nested object using dot notation path.
 * @param obj - The object to extract value from
 * @param path - Dot notation path (e.g., "authed_user.access_token")
 * @returns The value at the path, or undefined if not found
 */
export function getNestedValue<T>(obj: Record<string, unknown>, path: string): T | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current as T | undefined;
}

/**
 * Maps a non-standard OAuth token response to the standard MCPOAuthTokens format.
 * Uses the provided mapping configuration to extract tokens from nested paths.
 *
 * @param response - The raw token response from the OAuth server
 * @param mapping - Configuration specifying paths to token fields
 * @returns Normalized MCPOAuthTokens object
 * @throws Error if access_token is not found at the specified path
 */
export function mapTokenResponse(
  response: Record<string, unknown>,
  mapping: TokenResponseMapping,
): MCPOAuthTokens {
  const accessToken = getNestedValue<string>(response, mapping.access_token);
  if (!accessToken) {
    const responseKeys = Object.keys(response).join(', ');
    logger.error(
      `[MCPOAuth] Token response mapping failed: access_token not found at path "${mapping.access_token}"`,
      { responseKeys },
    );
    throw new Error(
      `Token response mapping failed: access_token not found at path "${mapping.access_token}". ` +
        `Response keys: ${responseKeys}`,
    );
  }

  // Extract token_type from mapped path or fallback to top-level
  const tokenType = mapping.token_type
    ? getNestedValue<string>(response, mapping.token_type)
    : (response.token_type as string | undefined);

  // Extract scope from mapped path or fallback to top-level
  const scope = mapping.scope
    ? getNestedValue<string>(response, mapping.scope)
    : (response.scope as string | undefined);

  // Extract expires_in from mapped path or fallback to top-level
  const expiresIn = mapping.expires_in
    ? getNestedValue<number>(response, mapping.expires_in)
    : (response.expires_in as number | undefined);

  // Extract refresh_token from mapped path or fallback to top-level
  const refreshToken = mapping.refresh_token
    ? getNestedValue<string>(response, mapping.refresh_token)
    : (response.refresh_token as string | undefined);

  const tokens: MCPOAuthTokens = {
    access_token: accessToken,
    token_type: tokenType || 'Bearer',
    obtained_at: Date.now(),
  };

  if (scope) {
    tokens.scope = scope;
  }
  if (expiresIn) {
    tokens.expires_in = expiresIn;
    tokens.expires_at = Date.now() + expiresIn * 1000;
  }
  if (refreshToken) {
    tokens.refresh_token = refreshToken;
  }

  logger.debug('[MCPOAuth] Token response mapped successfully', {
    has_access_token: true,
    has_refresh_token: !!refreshToken,
    has_scope: !!scope,
    has_expires_in: !!expiresIn,
    token_type: tokens.token_type,
  });

  return tokens;
}
