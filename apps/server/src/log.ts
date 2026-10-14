// Minimal structured logger: one JSON line per entry, so logs stay greppable in Docker.
type Level = 'debug' | 'info' | 'warn' | 'error';

const quiet = process.env.LOG_LEVEL === 'silent';

const ENTRY_KEYS: ReadonlySet<string> = new Set(['time', 'level', 'message']);

/**
 * One log line. The entry's own `time`, `level` and `message` come first and always win: a field
 * of the same name (e.g. a level id passed as `level`) can never overwrite them.
 */
export function logLine(
  time: string,
  level: Level,
  message: string,
  fields?: Record<string, unknown>,
): string {
  const rest = Object.entries(fields ?? {}).filter(([key]) => !ENTRY_KEYS.has(key));
  return JSON.stringify({ time, level, message, ...Object.fromEntries(rest) });
}

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (quiet) {
    return;
  }
  const line = logLine(new Date().toISOString(), level, message, fields);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};
