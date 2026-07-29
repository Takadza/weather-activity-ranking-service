import { timingSafeEqual } from 'node:crypto';

function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Shared metrics token check for API guard and worker HTTP handler. */
export function isMetricsAuthorized(
  configuredToken: string,
  authorizationHeader: string | undefined,
  metricsTokenHeader: string | undefined,
): boolean {
  if (!configuredToken) {
    return true;
  }
  if (
    metricsTokenHeader !== undefined &&
    tokensEqual(metricsTokenHeader, configuredToken)
  ) {
    return true;
  }
  if (authorizationHeader?.startsWith('Bearer ')) {
    const bearer = authorizationHeader.slice('Bearer '.length);
    if (tokensEqual(bearer, configuredToken)) {
      return true;
    }
  }
  return false;
}
