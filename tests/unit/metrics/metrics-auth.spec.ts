import { isMetricsAuthorized } from '../../../src/metrics/metrics-auth';

describe('isMetricsAuthorized', () => {
  it('allows all requests when token is unset', () => {
    expect(isMetricsAuthorized('', undefined, undefined)).toBe(true);
  });

  it('accepts Bearer token', () => {
    expect(isMetricsAuthorized('secret', 'Bearer secret', undefined)).toBe(
      true,
    );
  });

  it('accepts X-Metrics-Token header', () => {
    expect(isMetricsAuthorized('secret', undefined, 'secret')).toBe(true);
  });

  it('rejects missing or wrong token when configured', () => {
    expect(isMetricsAuthorized('secret', undefined, undefined)).toBe(false);
    expect(isMetricsAuthorized('secret', 'Bearer other', undefined)).toBe(
      false,
    );
    expect(isMetricsAuthorized('secret', 'Bearer secre', undefined)).toBe(
      false,
    );
  });
});
