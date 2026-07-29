import { ConsoleLogger, LogLevel } from '@nestjs/common';

const LEVEL_MAP: Record<string, LogLevel[]> = {
  verbose: ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'],
  debug: ['debug', 'log', 'warn', 'error', 'fatal'],
  log: ['log', 'warn', 'error', 'fatal'],
  info: ['log', 'warn', 'error', 'fatal'],
  warn: ['warn', 'error', 'fatal'],
  error: ['error', 'fatal'],
  fatal: ['fatal'],
};

export function logLevelsFromEnv(logLevel: string | undefined): LogLevel[] {
  return LEVEL_MAP[logLevel ?? 'info'] ?? LEVEL_MAP.info;
}

function emit(
  level: string,
  message: unknown,
  context?: string,
  stack?: string,
): void {
  const line = JSON.stringify({
    level,
    context,
    message: typeof message === 'string' ? message : String(message),
    stack,
    timestamp: new Date().toISOString(),
  });
  if (level === 'error' || level === 'fatal') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

/** JSON structured logger for production. */
export class JsonLogger extends ConsoleLogger {
  override log(message: unknown, context?: string): void {
    emit('log', message, context);
  }

  override error(
    message: unknown,
    stackOrContext?: string,
    context?: string,
  ): void {
    if (context !== undefined) {
      emit('error', message, context, stackOrContext);
      return;
    }
    // Nest may pass either (message, context) or (message, stack, context).
    const looksLikeStack =
      typeof stackOrContext === 'string' && stackOrContext.includes('\n');
    if (looksLikeStack) {
      emit('error', message, undefined, stackOrContext);
      return;
    }
    emit('error', message, stackOrContext);
  }

  override warn(message: unknown, context?: string): void {
    emit('warn', message, context);
  }

  override debug(message: unknown, context?: string): void {
    emit('debug', message, context);
  }

  override verbose(message: unknown, context?: string): void {
    emit('verbose', message, context);
  }

  override fatal(message: unknown, context?: string): void {
    emit('fatal', message, context);
  }
}
