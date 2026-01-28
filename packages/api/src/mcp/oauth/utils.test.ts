import type { TokenResponseMapping } from './types';
import { getNestedValue, mapTokenResponse } from './utils';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('getNestedValue', () => {
  it('should extract value from top-level path', () => {
    const obj = { access_token: 'token123' };
    expect(getNestedValue(obj, 'access_token')).toBe('token123');
  });

  it('should extract value from nested path', () => {
    const obj = {
      authed_user: {
        access_token: 'xoxp-123',
        token_type: 'user',
      },
    };
    expect(getNestedValue(obj, 'authed_user.access_token')).toBe('xoxp-123');
    expect(getNestedValue(obj, 'authed_user.token_type')).toBe('user');
  });

  it('should extract value from deeply nested path', () => {
    const obj = {
      level1: {
        level2: {
          level3: {
            value: 'deep-value',
          },
        },
      },
    };
    expect(getNestedValue(obj, 'level1.level2.level3.value')).toBe('deep-value');
  });

  it('should return undefined for missing paths', () => {
    const obj = { access_token: 'token123' };
    expect(getNestedValue(obj, 'missing.path')).toBeUndefined();
    expect(getNestedValue(obj, 'access_token.nested')).toBeUndefined();
  });

  it('should return undefined for null intermediate values', () => {
    const obj = { authed_user: null };
    expect(getNestedValue(obj, 'authed_user.access_token')).toBeUndefined();
  });

  it('should handle numeric values', () => {
    const obj = { expires_in: 3600 };
    expect(getNestedValue<number>(obj, 'expires_in')).toBe(3600);
  });
});

describe('mapTokenResponse', () => {
  const mockDateNow = 1700000000000;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDateNow);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('should map Slack-style nested token response', () => {
    const slackResponse = {
      ok: true,
      authed_user: {
        id: 'U1234567',
        access_token: 'xoxp-user-token-123',
        token_type: 'user',
        scope: 'channels:history,channels:read',
      },
    };

    const mapping: TokenResponseMapping = {
      access_token: 'authed_user.access_token',
      token_type: 'authed_user.token_type',
      scope: 'authed_user.scope',
    };

    const result = mapTokenResponse(slackResponse, mapping);

    expect(result.access_token).toBe('xoxp-user-token-123');
    expect(result.token_type).toBe('user');
    expect(result.scope).toBe('channels:history,channels:read');
    expect(result.obtained_at).toBe(mockDateNow);
  });

  it('should throw error when access_token path is invalid', () => {
    const response = {
      ok: true,
      data: { token: 'something' },
    };

    const mapping: TokenResponseMapping = {
      access_token: 'wrong.path.to.token',
    };

    expect(() => mapTokenResponse(response, mapping)).toThrow(
      'Token response mapping failed: access_token not found at path "wrong.path.to.token"',
    );
  });

  it('should use default token_type of Bearer when not provided', () => {
    const response = {
      authed_user: {
        access_token: 'token-123',
      },
    };

    const mapping: TokenResponseMapping = {
      access_token: 'authed_user.access_token',
    };

    const result = mapTokenResponse(response, mapping);

    expect(result.token_type).toBe('Bearer');
  });

  it('should calculate expires_at from expires_in', () => {
    const response = {
      data: {
        access_token: 'token-123',
        expires_in: 3600,
      },
    };

    const mapping: TokenResponseMapping = {
      access_token: 'data.access_token',
      expires_in: 'data.expires_in',
    };

    const result = mapTokenResponse(response, mapping);

    expect(result.expires_in).toBe(3600);
    expect(result.expires_at).toBe(mockDateNow + 3600 * 1000);
  });

  it('should extract refresh_token when mapped', () => {
    const response = {
      tokens: {
        access: 'access-token',
        refresh: 'refresh-token',
      },
    };

    const mapping: TokenResponseMapping = {
      access_token: 'tokens.access',
      refresh_token: 'tokens.refresh',
    };

    const result = mapTokenResponse(response, mapping);

    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
  });

  it('should fallback to top-level fields when mapping path not specified', () => {
    const response = {
      authed_user: {
        access_token: 'nested-token',
      },
      token_type: 'Bearer',
      scope: 'top-level-scope',
      expires_in: 7200,
      refresh_token: 'top-level-refresh',
    };

    const mapping: TokenResponseMapping = {
      access_token: 'authed_user.access_token',
      // token_type, scope, expires_in, refresh_token not mapped - should use top-level
    };

    const result = mapTokenResponse(response, mapping);

    expect(result.access_token).toBe('nested-token');
    expect(result.token_type).toBe('Bearer');
    expect(result.scope).toBe('top-level-scope');
    expect(result.expires_in).toBe(7200);
    expect(result.refresh_token).toBe('top-level-refresh');
  });

  it('should handle complete Slack OAuth v2 response', () => {
    const slackFullResponse = {
      ok: true,
      app_id: 'A12345',
      authed_user: {
        id: 'U12345',
        scope: 'search:read,channels:history',
        access_token: 'xoxp-full-user-token',
        token_type: 'user',
      },
      team: {
        id: 'T12345',
        name: 'Test Team',
      },
      enterprise: null,
    };

    const mapping: TokenResponseMapping = {
      access_token: 'authed_user.access_token',
      token_type: 'authed_user.token_type',
      scope: 'authed_user.scope',
    };

    const result = mapTokenResponse(slackFullResponse, mapping);

    expect(result.access_token).toBe('xoxp-full-user-token');
    expect(result.token_type).toBe('user');
    expect(result.scope).toBe('search:read,channels:history');
    expect(result.obtained_at).toBe(mockDateNow);
    expect(result.refresh_token).toBeUndefined();
    expect(result.expires_in).toBeUndefined();
    expect(result.expires_at).toBeUndefined();
  });
});
