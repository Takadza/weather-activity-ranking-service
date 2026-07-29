import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_ROUTE = 'isPublicRoute';

/** Mark a route/controller as exempt from ApiKeyGuard (e.g. /health/live). */
export const SkipApiKey = () => SetMetadata(IS_PUBLIC_ROUTE, true);
