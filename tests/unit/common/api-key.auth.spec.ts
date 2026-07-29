import { isApiKeyAuthorized } from '../../../src/common/api-key.auth';

describe('isApiKeyAuthorized', () => {
  it('allows all requests when key is unset', () => {
    expect(isApiKeyAuthorized('', undefined, undefined)).toBe(true);
  });

  it('accepts Bearer token', () => {
    expect(isApiKeyAuthorized('secret', 'Bearer secret', undefined)).toBe(true);
  });

  it('accepts X-API-Key header', () => {
    expect(isApiKeyAuthorized('secret', undefined, 'secret')).toBe(true);
  });

  it('rejects missing or wrong key when configured', () => {
    expect(isApiKeyAuthorized('secret', undefined, undefined)).toBe(false);
    expect(isApiKeyAuthorized('secret', 'Bearer other', undefined)).toBe(false);
    expect(isApiKeyAuthorized('secret', 'Bearer secre', undefined)).toBe(false);
  });
});
