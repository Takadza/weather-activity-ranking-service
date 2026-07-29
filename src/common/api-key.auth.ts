import { timingSafeEqual } from 'node:crypto';

function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Shared API key check for GraphQL/HTTP (Bearer or X-API-Key). */
export function isApiKeyAuthorized(
  configuredKey: string,
  authorizationHeader: string | undefined,
  apiKeyHeader: string | undefined,
): boolean {
  if (!configuredKey) {
    return true;
  }
  if (apiKeyHeader !== undefined && tokensEqual(apiKeyHeader, configuredKey)) {
    return true;
  }
  if (authorizationHeader?.startsWith('Bearer ')) {
    const bearer = authorizationHeader.slice('Bearer '.length);
    if (tokensEqual(bearer, configuredKey)) {
      return true;
    }
  }
  return false;
}
