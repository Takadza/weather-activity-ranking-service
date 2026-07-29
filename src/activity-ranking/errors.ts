export class ProviderUnavailableError extends Error {
  readonly name = 'ProviderUnavailableError';

  constructor(message = 'Weather provider unavailable') {
    super(message);
  }
}
